---
title: "Oracle statistics and histograms: why the CBO's plan changes when you gather stats"
description: "The Cost-Based Optimizer never looks at your data at parse time — only at statistics. Understanding histograms is how you stop plan regressions before they reach production."
date: "2026-08-24"
slug: "oracle-statistics-histograms-cbo-plan"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "cbo", "statistics", "histograms", "performance"]
translation_slug: "oracle-estatisticas-histogramas-plano-cbo"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

The call comes in on a Monday afternoon: a query that ran in 300 ms last week is now taking 12 seconds. Nothing in the code changed. The indexes are intact. The data model is identical. But over the weekend, the DBA ran `DBMS_STATS.GATHER_DATABASE_STATS` on the production instance, and the Cost-Based Optimizer picked a completely different execution plan.

This is not a bug. The optimizer is doing exactly what it was designed to do — and the fact that the new plan is slower tells you something precise: the statistics it just gathered are more accurate than the ones it had before, and they revealed a data distribution that the old plan was not built for.

Understanding what changed, and why, starts with how the CBO makes its decisions.

## What the CBO actually needs

Oracle's Cost-Based Optimizer builds execution plans by estimating the number of rows a given operation will return — the cardinality — and then comparing the estimated cost of different access paths to choose the cheapest plan. Full table scan or index range scan. Nested loop or hash join. Sort-merge or broadcast. Every branch in that decision tree depends on a cardinality estimate.

Cardinality estimates are only as good as the statistics the CBO has at parse time. Oracle statistics are metadata stored in the data dictionary — primarily `DBA_TAB_STATISTICS`, `DBA_COL_STATISTICS`, and related views — that describe the shape of the data in each table and index. The CBO reads these at parse time. It never inspects actual rows while building a plan.

If the statistics are absent, old, or misleading, the CBO falls back to defaults that are almost certainly wrong for your data. The resulting plan may have been correct when the stats were fresh. After a large batch load or a seasonal data shift, it may be catastrophically wrong.

## The basic numbers: rows, NDV, nulls, and density

For each table, Oracle tracks a handful of fundamental metrics:

- `NUM_ROWS`: the row count at the time of the last gather.
- `BLOCKS`: the number of data blocks the table occupies.
- `AVG_ROW_LEN`: average row size in bytes.

For each column:

- `NUM_DISTINCT` (NDV): distinct value count.
- `NUM_NULLS`: rows with a null value.
- `LOW_VALUE` / `HIGH_VALUE`: minimum and maximum values, stored in raw internal format.
- `DENSITY`: a single selectivity estimate derived from NDV.

When you query `WHERE status = 'ACTIVE'`, the CBO uses the column's NDV and density to estimate how many rows the predicate selects. If the column has 5 distinct values and no histogram, the optimizer assumes uniform distribution: each value accounts for one-fifth of the table. On uniformly distributed data, that estimate is accurate enough. On real production data, it is almost always wrong.

## The problem with uniform-distribution assumptions

Consider an `ORDERS` table with 10 million rows and a `STATUS` column that takes five values: `'OPEN'`, `'PROCESSING'`, `'SHIPPED'`, `'DELIVERED'`, and `'CANCELLED'`. Five distinct values. Without a histogram, the CBO assumes each status appears in 2 million rows — 20% of the table.

In practice, 97% of orders are `'DELIVERED'` or `'CANCELLED'`. Only 1.5% are `'OPEN'`, and `'PROCESSING'` is a transient state that holds at most a few thousand rows at any given moment.

A query for `WHERE status = 'PROCESSING'` should select roughly 0.03% of the table — an index range scan is almost certainly the right access path. A query for `WHERE status = 'DELIVERED'` should select 60% of the table — a full table scan is faster. Without a histogram, the CBO sees both predicates as "20% of 10 million rows" and may pick the wrong access path for both.

This is the gap that histograms fill. A histogram replaces the uniform-distribution assumption with a per-column model of the actual value distribution.

## Histogram types Oracle maintains

Oracle maintains four histogram types. Which one gets created depends on the column's NDV relative to the configured bucket limit (controlled by `METHOD_OPT`, defaulting to 254 buckets in recent releases).

**Frequency histogram**: created when NDV is small enough that every distinct value gets its own bucket. Each bucket records a value and its exact row count. The CBO knows precisely how many rows contain each distinct value. This is the most accurate type and the default choice for low-cardinality columns like status codes, boolean flags, and type discriminators.

**Top-frequency histogram** (12c and later): for columns where NDV exceeds the bucket limit but a small set of values dominates the distribution, Oracle tracks the top-N values by frequency and lumps everything else into a catch-all. This captures the vast majority of analytical benefit at a fraction of the storage cost.

**Height-balanced histogram**: the older form, which fills each bucket with an equal number of rows and records the endpoint value. Less precise than frequency histograms for low-cardinality columns, but still useful for range predicates on continuous numeric or date columns.

**Hybrid histogram** (12c and later): a blend of the above — high-frequency values get dedicated buckets; the remaining buckets use the height-balanced approach. It captures skew at the top of the distribution without losing coverage of the long tail.

Oracle chooses among these automatically during a stats gather based on the column's NDV and the `METHOD_OPT` setting. You can inspect which type a column has by querying `DBA_TAB_COL_STATISTICS.HISTOGRAM`.

## Why stale statistics cause plan regressions

Oracle's automatic statistics-gathering maintenance task runs during the default maintenance window (typically nightly), gathering stats on tables whose data has changed by more than 10% since the last gather. On active OLTP systems, that threshold can trigger gathers on core transactional tables every night.

The regression pattern looks like this: a batch job runs Sunday night, inserting a large volume of rows into a staging table. The auto task fires, gathers fresh stats, and the CBO now sees that table as 200× larger than it did the day before. A query that joined this table using a nested loop — because it was "small" — now chooses a hash join — because it is "large." The plan change follows logically from the new statistics. But if the query's response-time budget assumed nested-loop behavior, performance falls off a cliff.

The fix is almost never "revert the stats gather." The fix is understanding what the new statistics revealed about the data and tuning the query to handle both old and new distributions correctly.

## Gathering statistics deliberately

The default `DBMS_STATS.GATHER_DATABASE_STATS(OPTIONS => 'GATHER AUTO')` is appropriate for most workloads. For tables where plan stability matters more than statistical freshness, two techniques are worth knowing.

**Locking statistics**: `DBMS_STATS.LOCK_TABLE_STATS('SCHEMA', 'TABLE_NAME')` prevents the auto task from overwriting manually crafted or imported stats. Use this for lookup tables, calendar tables, or any table whose data distribution is effectively static.

**Pending statistics**: Setting `PUBLISH` to `FALSE` on a table causes freshly gathered stats to land in a pending state rather than going live immediately. You can then test the pending stats by setting `OPTIMIZER_USE_PENDING_STATISTICS = TRUE` at the session level, confirm that the plan behavior is acceptable, and publish with `DBMS_STATS.PUBLISH_PENDING_STATS`. This is the right workflow when you need to validate a stats gather before committing it to production.

Extended statistics (`DBMS_STATS.CREATE_EXTENDED_STATS`) let you gather statistics on column groups — pairs or tuples of columns that are frequently filtered together. If your queries commonly filter on both `REGION` and `STATUS`, the optimizer's estimate for the combined predicate will be more accurate with a column-group statistic than with two independent single-column statistics multiplied together.

## Reading the CBO's estimates in the plan output

When a query regresses after a stats gather, look at the cardinality estimates in the execution plan before you look at the access paths. The access path is a symptom. The cardinality estimate is the cause.

```sql
EXPLAIN PLAN FOR
  SELECT o.order_id, c.customer_name
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  WHERE o.status = 'PROCESSING';

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(FORMAT => 'ALL'));
```

In the output, compare the `Rows` column (estimated cardinality) against actual runtime row counts, visible in `DBMS_XPLAN.DISPLAY_CURSOR` with the `ALLSTATS LAST` format after running the query with `GATHER_PLAN_STATISTICS` enabled:

```sql
SELECT /*+ GATHER_PLAN_STATISTICS */ o.order_id, c.customer_name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'PROCESSING';

SELECT * FROM TABLE(
  DBMS_XPLAN.DISPLAY_CURSOR(FORMAT => 'ALLSTATS LAST')
);
```

A large discrepancy at a given step — say, 2,000,000 estimated where 4,500 actual — is the CBO telling you exactly where its model failed. That is almost always where a missing or stale histogram is doing damage. A column whose estimated cardinality is wildly off will skew every join order, join method, and access path downstream of that estimate.

Veesker's EXPLAIN PLAN viewer surfaces estimated and actual cardinality side-by-side when execution statistics are available, making this comparison immediate rather than requiring a manual `DBMS_XPLAN.DISPLAY_CURSOR` call.

## A more useful relationship with the optimizer

The CBO is not opaque. Every plan it produces follows from the statistics it has access to. When a plan changes after a stats gather, the right question is not "how do I stop stats from changing the plan?" but "what did the new statistics reveal about my data that the old plan wasn't built for?"

Histograms are the mechanism that turns column-level metadata from a rough guess into a workable model of reality. Understanding which histogram type covers which distribution — and when to lock, pend, or gather fresh statistics — is the difference between reacting to plan regressions and anticipating them.

The optimizer is on your side. Give it accurate information and it will give you a decent plan. Give it stale or absent information and it will give you the best plan it can construct from a lie. The statistics gather is not the enemy of plan stability; it is the prerequisite for it.

---

Download Veesker to explore your execution plans with estimated and actual cardinality side-by-side: [veesker.cloud/download](/download).

— *Veesker*
