---
title: "Oracle statistics and histograms: why the CBO's plan changes when you gather stats"
description: "The Cost-Based Optimizer is only as good as the statistics it reads. Understanding how Oracle gathers and uses statistics — and where histograms fit in — is the foundation of plan stability."
date: "2026-08-31"
slug: "oracle-statistics-histograms-cbo-plan"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "performance", "statistics", "cbo", "histograms"]
translation_slug: "oracle-estatisticas-histogramas-plano-cbo"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

A query runs fine for six months. Then someone runs `DBMS_STATS.GATHER_TABLE_STATS` on the main table — or the weekend maintenance job beats them to it — and the execution plan changes. Sometimes for better. Sometimes for dramatically worse. The team opens the incident, rolls back stats with `DBMS_STATS.RESTORE_TABLE_STATS`, and files a ticket to revisit it "when things calm down."

This pattern is common enough that it has become a kind of tribal knowledge: "gather stats carefully, gather them rarely, and keep a restoration point." That guidance is not wrong, but it treats the symptom. The root issue is that most developers who work in Oracle every day have only a rough model of what statistics the CBO actually reads, and no model at all of what histograms contain and why they change optimizer decisions.

This post fills that gap. No invented benchmarks, no magic thresholds — just an accurate description of what Oracle stores and how the optimizer uses it.

## What the CBO knows

Oracle's Cost-Based Optimizer selects an execution plan by estimating the cost of each candidate plan, where cost is a proxy for I/O and CPU. To estimate cost, the optimizer estimates *cardinality* at each step: how many rows does this table scan return? How many rows survive this filter? How many rows does this join produce?

Cardinality estimates come from statistics. Oracle stores two main kinds.

**Object statistics** describe the table as a whole. The relevant columns in `DBA_TABLES` (or `ALL_TABLES` for what your user can see) are `NUM_ROWS`, `BLOCKS`, and `AVG_ROW_LEN`. `LAST_ANALYZED` tells you when these were last gathered. The optimizer uses `NUM_ROWS` constantly — it divides by `NUM_DISTINCT` on a column to estimate filter selectivity, it multiplies by join selectivity to estimate result set sizes.

**Column statistics** describe individual columns. `DBA_TAB_COLUMNS` (or `DBA_TAB_COL_STATISTICS` for the analyzed subset) carries `NUM_DISTINCT`, `NUM_NULLS`, `DENSITY`, `LOW_VALUE`, and `HIGH_VALUE`, plus `NUM_BUCKETS` and `HISTOGRAM` type. These are the numbers the optimizer applies when evaluating `WHERE` predicates and join conditions.

The basic cardinality formula for an equality predicate on a column without a histogram is: `NUM_ROWS / NUM_DISTINCT`. If a table has 10 million rows and the column has 50,000 distinct values, the optimizer assumes each value appears 200 times and estimates a filter on any given value returns 200 rows. This is correct when the data is uniformly distributed. It is badly wrong when it is not.

## Where histograms enter

Histograms exist precisely for non-uniform data. They record the actual shape of a column's value distribution, not just the count of distinct values.

Oracle supports four histogram types, determined at gather time based on the column's characteristics.

**Frequency histograms** are created when the number of distinct values is small enough — specifically, at or below the bucket limit (2048 buckets in Oracle 12c and later; 254 in earlier versions). Each bucket represents one distinct value and stores the cumulative count of rows up to that value. With a frequency histogram, the optimizer knows the exact row count for every distinct value. It does not have to assume uniformity.

**Height-balanced histograms** were the fallback before Oracle 12c for columns with too many distinct values. Each of the 254 buckets holds approximately the same number of rows. Popular values appear as their own endpoint (a repeated endpoint value signals that bucket is dedicated to a single popular value). Height-balanced histograms are still created in 12c+ when a column cannot qualify for one of the newer types, but top-frequency and hybrid are preferred.

**Top-frequency histograms** (introduced in Oracle 12c) handle the common case where a column has many distinct values but a small number of those values account for most of the rows. The optimizer stores exact counts for the top N most frequent values and lumps the rest into a residual bucket. If 95% of your `STATUS` column is `'ACTIVE'` and `'CLOSED'`, with forty other values sharing the remaining 5%, a top-frequency histogram captures the dominant values exactly.

**Hybrid histograms** (also Oracle 12c+) combine the approaches. They use height-balanced buckets to cover the full value range while also storing exact counts for the popular values that would otherwise be absorbed into a shared bucket. This gives the optimizer accurate cardinality for both the common values and a reasonable approximation for the tail.

## Why gathering stats changes the plan

With that background, the common plan-change scenarios become concrete.

A table grows significantly — say, a `SALES` table doubles over a quarter. Object statistics are stale. The optimizer's `NUM_ROWS` is half of reality, so every cardinality estimate downstream is halved. A full table scan that used to look expensive now looks cheap. A nested loops join that was correctly costed for 1 million rows now appears to handle 500,000, possibly switching away from a hash join that would perform better. Gathering object stats alone restores the correct scale.

A data skew shift is subtler. A `REGION` column historically had data spread across ten regions. A new product launch pushed 70% of all rows to one region. Before the histogram refresh, the optimizer estimated each region at 10% selectivity and picked a full table scan for a region filter. After gathering stats with `SIZE AUTO` on that column, the optimizer sees a top-frequency histogram showing the dominant region at 70% and the long tail sharing 30%. A query filtering on one of the rare regions now gets a correctly low cardinality estimate and may select an index range scan. A query filtering on the dominant region gets a correctly high estimate and stays with the full scan.

The plan change is not a regression. It is the optimizer correcting a broken picture.

## Gathering stats deliberately

The relevant procedure is `DBMS_STATS.GATHER_TABLE_STATS`. The parameters that matter most for production use:

`estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE` is the default in Oracle 11g and later and should stay the default. Oracle uses a two-pass sampling algorithm (introduced in 11g) that determines an appropriate sample size based on the column's NDV estimates. Do not set a fixed percentage unless you have a documented reason.

`method_opt => 'FOR ALL COLUMNS SIZE AUTO'` tells Oracle to gather histograms based on column usage tracking — specifically, whether Oracle has observed that a column appears in `WHERE` clauses since the last gather. Columns that have never appeared in a predicate do not get histograms. Columns that are frequently filtered on get them. This is the correct default for most workloads.

`cascade => TRUE` gathers index statistics at the same time. Missing index stats force the optimizer to make blind guesses about index selectivity. Set this to true when gathering on a table that has been significantly modified.

`no_invalidate => FALSE` allows Oracle to invalidate and re-parse cursors that reference the table immediately after statistics are gathered. The alternative, `DBMS_STATS.AUTO_INVALIDATE` (the default), invalidates cursors gradually over a rollout window to avoid a sudden reparsing storm on a busy system. On development or staging, `FALSE` gives immediate feedback. In production, the default is gentler.

## Stale statistics and the maintenance job

Oracle marks statistics as stale when a monitoring threshold is crossed. By default, statistics are considered stale when at least 10% of a table's rows have been inserted, updated, or deleted since the last gather. The view `DBA_TAB_MODIFICATIONS` accumulates change counts; `DBA_TAB_STATISTICS` has a `STALE_STATS` column that reflects the comparison.

The automatic maintenance job — `GATHER_STATS_JOB`, running under the Oracle Scheduler inside a maintenance window — gathers stats on stale objects during off-peak hours. The default windows are 10 PM to 6 AM on weekdays and all day on weekends, though this varies by configuration. On a system with high daily write volume, the job may re-gather stats on major tables every night, which is why a plan that is stable by midday may look different the following morning.

Locking statistics on a table with `DBMS_STATS.LOCK_TABLE_STATS` prevents any automatic gather from changing them until explicitly unlocked. This is the correct production lever when a set of statistics is known to produce a good plan and should not drift.

## What this looks like in Veesker

The schema browser in Veesker surfaces `LAST_ANALYZED` on every table and index object in your tree. When you open a table, the statistics panel shows `NUM_ROWS`, `BLOCKS`, and the staleness indicator from `DBA_TAB_STATISTICS`. Column statistics and histogram types are visible at the column level — you can see whether a given column has a frequency, top-frequency, hybrid, or no histogram, and when it was last analyzed.

This is the same data the optimizer is reading. When an `EXPLAIN PLAN` produces a cardinality estimate that does not match your intuition about the data, the starting point is always the statistics the optimizer had access to — and seeing them inline, in the same tool, cuts down the debugging loop considerably.

The local-first architecture means none of this schema metadata travels outside your machine. Veesker reads the data dictionary over your existing connection, displays it locally, and keeps it local. The Community Edition is Apache 2.0 and free to download. The Cloud layer, which will add managed AI-driven plan analysis and schema-aware suggestions, is coming in H2 2026.

---

If you spend time reading `EXPLAIN PLAN` output, understanding the statistics underneath it is the next step. [Download Veesker](/download) and start with the statistics panel on your heaviest table.

— *Veesker*
