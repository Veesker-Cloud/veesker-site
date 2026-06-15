---
title: "Per-connection safety in Veesker: env tags, read-only mode, statement timeouts, and DML guards"
description: "How Veesker's per-connection safety controls — env tags, read-only mode, statement timeouts, and unsafe-DML guards — make the wrong connection feel different before you execute."
date: "2026-06-15"
slug: "per-connection-safety-env-tags-read-only-statement-timeouts"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "safety", "developer-tools", "dml", "connection-management"]
translation_slug: "seguranca-por-conexao-tags-de-ambiente-modo-somente-leitura"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

When you have eight database connections open — two production, one staging, four development instances, and a sandbox — the most dangerous moment is not the one where you write a bad query. It is the one where you run a perfectly valid query on the wrong connection.

A `DELETE FROM orders WHERE status = 'PENDING'` is entirely reasonable on your local dev database. On the real production system, it is a production incident.

The standard answer from most tools is "be careful." Veesker's answer is a set of per-connection safety controls that make carelessness structurally harder.

## Environment tags

Every connection in Veesker carries an environment tag: `DEV`, `TEST`, `STAGING`, or `PROD`. The tag is set when you create the connection profile, and it propagates visually throughout the interface.

- Connection tabs show a colored badge: green for dev, yellow for test, orange for staging, red for production.
- The query editor chrome changes to match: a thin border in the environment color frames the editor on the active connection.
- Copying a connection string to a new profile preserves the tag — it does not accidentally inherit the source environment's color.

The visual distinction is not decoration. When you are moving quickly between tabs and a red border sits in your peripheral vision, the cognitive overhead of "wait, which connection am I on?" drops significantly. You build the habit the first time you see a production connection turn red; after that, the color does the remembering for you.

You can rename the environment labels and change the color palette in settings. The defaults follow convention, not regulation — if your shop uses "live" instead of "prod," that's a three-second edit.

## Read-only mode

Each connection profile has an optional read-only toggle. When enabled, Veesker checks every statement before it reaches the database driver.

The mechanics are direct: Veesker parses the statement to identify the statement type before executing. If it is a `SELECT`, `EXPLAIN PLAN`, or a `WITH ... SELECT` read expression, it passes through. If it is an `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, or `CALL`, Veesker intercepts it and presents a confirmation modal:

> This connection is configured as read-only. Statement type: DELETE. Execute anyway?

Two buttons: **Cancel** and **Execute (bypass read-only for this statement)**. There is no "disable read-only globally" shortcut in that modal by design — the override is always per-statement, always deliberate.

A few things read-only mode does not do: it does not set the Oracle session to `ALTER SESSION SET CONSTRAINTS = READ ONLY`, and it does not enforce the restriction at the database level. The protection is in the application layer. This means it works on any Oracle version without requiring DBA privileges on the target database — and it means that a JDBC connection from a different tool would still reach the database unguarded. Read-only mode in Veesker is a UX safety net, not a security boundary. If you need database-level read enforcement, use a read-only Oracle user or a standby database with Active Data Guard.

## Statement timeouts

Long-running queries are the most common cause of unplanned production load events that start in a developer's query window. The scenario is familiar: a developer opens a production connection to investigate a slow report, rewrites the query to test a join order change, and accidentally stages the old slow path on a server with no resource manager limits active.

Veesker lets you set a per-connection statement timeout in seconds. When a statement exceeds the timeout, Veesker cancels it — calling `OCI_BREAK` on the active call, which sends an immediate break request to the Oracle server. The query is cancelled at the server level, not just abandoned at the client.

The default is no limit. The connection profile accepts an integer value in seconds. A reasonable starting point for production connections is 30 seconds; for analytical workloads or batch queries you may need to raise it or leave it disabled on a dedicated connection profile.

The timeout applies to the execution phase. It does not apply to the fetch phase — if a query returns successfully in 5 seconds but you then start fetching 10 million rows slowly, the timeout does not fire. That distinction matters for large result sets on slow networks.

One practical note: `DBMS_SCHEDULER` calls and long-running PL/SQL blocks that loop internally in a single statement are also subject to the timeout. If you have legitimate long-running procedures, create a separate connection profile with no timeout for batch operations and keep the restricted one for interactive use.

## Unsafe-DML guards

Beyond read-only mode, Veesker has a separate layer of guards for statements that are technically valid DML but carry above-average risk of irreversible data loss:

- `DELETE` without a `WHERE` clause
- `TRUNCATE TABLE`
- `DROP TABLE`, `DROP INDEX`, `DROP SEQUENCE`, `DROP PACKAGE`, `DROP TYPE`
- `ALTER TABLE ... DROP COLUMN`
- `UPDATE` without a `WHERE` clause on a table with more than a configurable row threshold (default: 10,000 rows — checked via `NUM_ROWS` in `ALL_TABLES`, which reflects the last statistics gather)

For each of these, Veesker presents a confirmation step that names the object affected and the estimated scope:

> Unsafe DML detected: DELETE FROM orders (no WHERE clause). Table has approximately 1,847,233 rows per last statistics gather. Execute?

The row count estimate comes from `ALL_TABLES.NUM_ROWS` via a metadata query run at parse time. It lags if statistics are stale, and it is 0 on tables where statistics have never been gathered. The guard shows whatever Oracle has in that column — it does not block execution for a zero count, because blocking every unguarded operation on a new table would produce more friction than safety.

You can suppress a specific guard type permanently in settings, or disable all guards on a specific connection. You can also add custom patterns — if your shop has a naming convention for log or staging tables that are safe to truncate, you can add a regex to the guard allowlist and remove the prompt for matching table names.

## How the AI layer respects these controls

These safety controls interact directly with Veesker's AI layer. When you ask the AI to generate a query on a connection that is tagged `PROD` and marked read-only, the context passed to the model includes those attributes. The AI will:

- Prefer `SELECT` over write patterns when the intent is ambiguous
- Flag in the response if the suggested query is a write operation on a read-only connection, rather than generating it silently
- Avoid generating `TRUNCATE` or unguarded `DELETE` statements when the connection tag is `PROD` or `STAGING`

This is not a hard block — the AI will still generate write queries when you explicitly ask for one. The safety metadata shapes the model's defaults, not its hard constraints. The hard constraints live in the guards described above.

The Cloud layer (coming H2 2026) extends this further: managed connections can carry team-level safety policies set by a DBA or team lead, and those policies travel with the shared connection profile rather than requiring each developer to configure them individually.

## Defaults that protect without requiring a checklist

The philosophy behind these features is that safety controls should work out of the box. Environment tags are visually immediate the first time you assign them. Read-only mode is a single toggle in the connection profile. Statement timeouts have a sensible no-limit default you can tighten. Unsafe-DML guards are on for all connections unless you turn them off.

The goal is not to make Veesker an approval workflow for queries. The goal is to make the moment when you have the wrong connection active feel different — visually, mechanically, cognitively — from the moment when you have the right one. That difference shows up in the three seconds before you press execute, which is exactly where it needs to be.

Veesker is local-first and open-source (Apache 2.0). These safety features work entirely on your machine — no telemetry, no phone-home, no managed service required to turn them on. The Cloud tier (H2 2026) adds team-level policy management as an optional layer on top of the same foundation.

---

Download Veesker and configure your connection safety profiles: [veesker.cloud/download](/download).

— *Veesker*
