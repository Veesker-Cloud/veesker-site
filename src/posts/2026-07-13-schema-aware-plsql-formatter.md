---
title: "Writing a schema-aware PL/SQL formatter: rules you can't get from a generic linter"
description: "Generic SQL formatters work on syntax. PL/SQL formatting decisions are often semantic — and the right answer lives in the database, not in the source text."
date: "2026-07-13"
slug: "schema-aware-plsql-formatter"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "formatter", "developer-tools", "linter"]
translation_slug: "formatador-plsql-com-schema"
read_minutes: 6
author: "claude-agent"
hero: "/datamap-hero.png"
---

Generic SQL formatters operate on syntax. They parse a token stream, apply indentation rules, normalize casing, and emit the result. For most SQL dialects that is good enough most of the time. For PL/SQL it is necessary but not sufficient — because PL/SQL formatting decisions that look like style choices are often semantic choices, and the right answer depends on information that lives in the database, not in the source text.

This post covers the class of rules that require schema knowledge to get right, and how Veesker's formatter integrates live connection metadata to handle them.

## Where generic formatters stop working

Start with identifier casing. A generic formatter has two options: uppercase everything, lowercase everything, or pass through unchanged. Each choice is internally consistent and syntactically safe. None of them are semantically consistent with a codebase where the DBA named a table `Customer_Account` in mixed case and the application code has accumulated ten years of `CUSTOMER_ACCOUNT`, `customer_account`, and `Customer_Account` scattered across five hundred procedures.

Oracle identifiers are case-insensitive when unquoted, so the database does not care. The humans maintaining the code do. A formatter that normalizes to all-uppercase is making a choice that may contradict the team's actual naming convention without either party knowing it. A schema-aware formatter can read object names from `ALL_OBJECTS` or `USER_OBJECTS` and normalize references to match — or at minimum flag inconsistencies.

Hint formatting is a starker example:

```sql
SELECT /*+ INDEX(e EMP_IDX_DEPT_HIRE) PARALLEL(e, 4) */
       e.employee_id,
       e.hire_date
FROM   employees e
WHERE  e.department_id = :dept_id;
```

A generic formatter has no way to know whether `EMP_IDX_DEPT_HIRE` is a real index. It may reformat the hint, strip the comment depending on how the parser handles hint syntax, or pass it through intact. What it cannot do is tell you that the index was renamed to `EMP_DEPT_HIRE_IDX` last quarter during a DBA housekeeping run, so your hint is now silently ignored by the optimizer.

Schema awareness means reading `ALL_INDEXES` and cross-referencing hint content against the actual index names on the tables in scope. That is not formatting as style — it is formatting as correctness.

## PL/SQL-specific structure rules

Beyond database-side metadata, PL/SQL has structural constructs that generic SQL parsers either mishandle or skip. A formatter that does not speak PL/SQL as a first-class language will produce output that compiles but reads like it was formatted by a tool that does not understand what it is looking at.

**Package spec and body alignment.** The spec declares; the body defines. A formatter that treats both as independent SQL blocks will ignore the pairing and produce inconsistent indentation between a procedure declaration in the spec and its implementation in the body. The formatter needs to understand the two-file structure and apply consistent rules across the pair.

**FORALL and BULK COLLECT.** These are not `FOR` loops with a different keyword. They have different performance characteristics, different exception handling via `SAVE EXCEPTIONS`, and different constraints on the collection types they operate on. Formatting them identically to a cursor FOR loop misrepresents what the code does.

```sql
-- cursor FOR loop: row-by-row, straightforward cursor semantics
FOR r IN (SELECT * FROM orders WHERE status = 'P') LOOP
  process_order(r.order_id);
END LOOP;

-- BULK COLLECT + FORALL: set-based, very different performance profile
SELECT *
BULK COLLECT INTO l_orders
FROM orders
WHERE status = 'P';

FORALL i IN 1..l_orders.COUNT
  INSERT INTO order_archive VALUES l_orders(i);
```

A generic formatter that sees `FORALL` and `FOR` as the same loop construct will format the FORALL body as if it contains procedural statements. The formatting rule for FORALL is that the body is a single DML statement — no `BEGIN`/`END`, no semicolons inside the bound. Getting this wrong does not break compilation, but it produces output that looks like it was written by someone who has not used `FORALL` before.

**CONNECT BY and hierarchical queries.** The clause ordering in a hierarchical query carries semantic weight:

```sql
SELECT employee_id,
       LEVEL,
       SYS_CONNECT_BY_PATH(last_name, '/') AS path
FROM   employees
START WITH manager_id IS NULL
CONNECT BY PRIOR employee_id = manager_id
ORDER SIBLINGS BY last_name;
```

`ORDER SIBLINGS BY` is not the same as `ORDER BY` in a hierarchical query. `START WITH` must precede `CONNECT BY`. A formatter that reorders clauses by applying generic SQL precedence rules — putting `WHERE` before other filtering clauses, or normalizing `ORDER BY` position — will produce output that either does not parse or silently changes behavior.

## Schema-aware rules in practice

With a live connection, the formatter can do things that are impossible from source text alone.

**Ambiguous column references.** PL/SQL procedures frequently reference columns without table-alias qualification, especially inside `WHERE` clauses and `UPDATE SET` lists. When two joined tables share a column name, Oracle resolves the reference by precedence rules that are not obvious from reading the code. A schema-aware formatter can read column metadata for the tables in scope and flag ambiguous references:

```sql
-- 'status' exists in both orders and order_lines — which one?
UPDATE orders o
   SET status = 'C'   -- this is o.status, but a reader cannot tell
 WHERE o.order_id IN (
   SELECT ol.order_id
     FROM order_lines ol
    WHERE ol.line_type = 'P'
 );
```

**Type-aware bind variable warnings.** Oracle's optimizer treats numeric and string bind variables differently when building execution plans. A formatter that understands column types from `ALL_TAB_COLUMNS` can flag cases where a bind variable of the wrong declared type might cause an implicit conversion and suppress index use:

```sql
-- department_id is NUMBER; a VARCHAR2 bind here forces implicit conversion
WHERE e.department_id = :dept_id
```

This is a linter check as much as a formatting rule, but the information comes from the same schema read, and surfacing it at format time is the right moment to catch it — before the query reaches the optimizer and the execution plan silently degrades.

**Dynamic SQL content.** `EXECUTE IMMEDIATE` with concatenated string literals is a red flag for SQL injection, and also sometimes unavoidable in DDL that cannot use bind variables. A schema-aware formatter can read the string content and determine whether it contains a `SELECT`, a DML statement, or DDL — and format the embedded SQL consistently:

```sql
EXECUTE IMMEDIATE
  'ALTER TABLE ' || p_table_name || ' ENABLE ROW MOVEMENT';
```

Formatting the embedded statement consistently, even inside a string literal, makes code auditable. A formatter that ignores dynamic SQL content produces opaque blobs where the actual statement is invisible to static analysis.

## The rules a generic linter cannot express

A useful way to characterize the gap: generic linters work on tokens and grammar rules. The rules above require joining against the database catalog. They are queries against `ALL_OBJECTS`, `ALL_TAB_COLUMNS`, `ALL_INDEXES`, `ALL_PROCEDURES`, and related views — views that hold the semantic context the source text does not carry.

This is not a criticism of generic linters. SQLFluff, pgFormatter, and similar tools are doing the right thing for the surface they target. The Oracle PL/SQL surface — with its hint architecture, its version-sensitive syntax variants from 9i through 26ai, its package pairing conventions, its catalog-registered types and object tables — is a different problem.

The formatter that covers it fully is not a SQL formatter with an Oracle plugin. It is a formatter built against Oracle's catalog as a first-class data source.

## How Veesker handles this

Veesker's formatter runs against the live connection's metadata. When you format a procedure, the formatter reads the relevant object definitions from `ALL_OBJECTS`, `ALL_TAB_COLUMNS`, `ALL_INDEXES`, and `ALL_PROCEDURES` for the tables and packages in scope. That read is cached per session, so the second format of the same procedure is fast.

The rules that require schema knowledge are surfaced as annotations rather than automatic rewrites. You see the suggestion and decide whether to apply it. The goal is a formatter that informs without overriding.

The formatter ships in the Community Edition — Apache 2.0, works fully offline, no telemetry. The Cloud layer (coming H2 2026) will extend it with team-shared formatting rule profiles and schema drift detection across environments. Veesker does not phone home to apply these rules: the schema read is a local query against the connected Oracle instance, same as any query you run in the editor.

A generic SQL formatter is a useful tool. A schema-aware PL/SQL formatter is a different tool, and the difference is not cosmetic.

Download Veesker and format your first PL/SQL package against a live schema: [veesker.cloud/download](/download).

— *Veesker*
