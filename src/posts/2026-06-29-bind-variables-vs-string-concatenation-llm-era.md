---
title: "Bind variables vs string concatenation: still relevant in the LLM era"
description: "LLMs trained on web code tend to generate string-concatenated SQL. Here is why that is an Oracle performance problem, and how schema-aware AI avoids it."
date: "2026-06-29"
slug: "bind-variables-vs-string-concatenation-llm-era"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "performance", "sql", "ai", "plsql"]
translation_slug: "bind-variables-vs-concatenacao-era-llm"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

The argument for bind variables over string concatenation has been rehearsed since Oracle 7. It is in every Oracle performance book, every DBA onboarding checklist, every version of the *Oracle Database 2 Day + Performance Tuning Guide*. You would think, by 2026, it would be settled.

It is not settled. Because now the people writing SQL are increasingly not developers who read Oracle performance books — they are asking an LLM to write the SQL for them. And LLMs, left to their own training distributions, default to string concatenation. The problem did not go away. It found a new source.

## What cursor sharing actually does

Oracle's shared pool keeps a library cache: a hash-indexed collection of compiled SQL statements. When you execute a SQL statement, Oracle computes a hash of the exact text, looks it up in the library cache, and if it finds a match, reuses the existing parsed, optimized execution plan. That is a **soft parse** — a few microseconds, effectively free.

If the statement is not in the library cache, Oracle has to hard-parse it: parse the text, check syntax, validate object privileges, build the query plan using the cost-based optimizer. On a simple query, a hard parse adds milliseconds. On a complex query with joins, subqueries, and hints, it can be tens of milliseconds. Across a high-throughput application running thousands of queries per second, the cumulative cost is not trivial.

The catch: the hash is computed over the **literal text** of the SQL statement. Two queries that differ by a single character are treated as two entirely different statements.

```sql
-- These three statements produce three different library cache entries:
SELECT * FROM orders WHERE customer_id = 1001
SELECT * FROM orders WHERE customer_id = 1002
SELECT * FROM orders WHERE customer_id = 1003
```

Replace the literal with a bind variable, and all three statements become one:

```sql
SELECT * FROM orders WHERE customer_id = :cust_id
```

One hard parse, one library cache entry, thousands of soft parses against the same plan. This is cursor sharing, and it is the reason Oracle's shared pool exists at all.

## Why string concatenation pollutes the shared pool

Every time you build a SQL string by concatenating a value into the text, you guarantee a unique statement that will never match a prior entry. In a PL/SQL procedure that runs ten thousand times per hour, that is ten thousand hard parses per hour — each one acquiring library cache latches, each one running the optimizer, each one bloating the shared pool with entries that get aged out before they can be reused.

The performance manifestations are specific. You will see high *parse time elapsed* in `V$SQL`. You will see excessive *library cache latch* waits in `V$SESSION_WAIT`. You will see a shared pool that churns so fast that `V$SQLAREA` shows almost every statement with `EXECUTIONS = 1`. You will see CPU time on the database server that tracks suspiciously close to query volume, rather than to data volume or I/O.

In Oracle 9i and 10g, this was a common enough anti-pattern that Oracle shipped `cursor_sharing = FORCE` as an emergency escape hatch — a parameter that forces the database to replace literals with system-generated bind variables at parse time. It works, badly. It interferes with histograms and can cause the optimizer to pick worse plans for columns with skewed data distributions. It is still documented; it is not a solution.

The solution is to not generate string-concatenated SQL in the first place.

## LLMs default to the wrong side

Here is what a generic LLM produces when you ask it to write a PL/SQL procedure to fetch order details:

```sql
-- What a generic LLM tends to generate:
PROCEDURE get_order(p_order_id NUMBER) IS
  v_sql VARCHAR2(200);
BEGIN
  v_sql := 'SELECT * FROM orders WHERE order_id = ' || p_order_id;
  EXECUTE IMMEDIATE v_sql;
END;
```

This is not the model hallucinating something it does not know. It is the model faithfully reproducing the pattern that appears most often in its training data. Web tutorials, Stack Overflow answers, code examples from a decade of blog posts — a significant proportion of them use string concatenation for dynamic SQL because it is the path of least resistance when writing a quick example.

The correct version is not difficult:

```sql
PROCEDURE get_order(p_order_id NUMBER) IS
  v_sql VARCHAR2(200);
BEGIN
  v_sql := 'SELECT * FROM orders WHERE order_id = :oid';
  EXECUTE IMMEDIATE v_sql USING p_order_id;
END;
```

The `USING` clause passes the bind variable value separately from the SQL text. Oracle parses the text once and reuses the plan on every call. The shared pool stays clean.

For static SQL — which is what you should use when the statement structure is fixed — there is no `EXECUTE IMMEDIATE` at all:

```sql
PROCEDURE get_order(p_order_id NUMBER) IS
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE order_id = p_order_id;
  -- p_order_id here is implicitly a bind variable
END;
```

Static SQL in PL/SQL always uses bind variables. The Oracle PL/SQL compiler handles that. The risk is confined to dynamic SQL, and the risk is entirely in whether the developer reaches for `||` or `USING`.

## The SQL injection footnote (still applicable)

The performance argument is the dominant one for Oracle work, but it is worth naming the other: string concatenation is also how SQL injection happens. If `p_order_id` were a VARCHAR2 instead of a NUMBER, a caller could pass `1 OR 1=1 --` and read the full table. With a bind variable, the value is never interpolated into the statement text — it is passed as data, not code. The statement structure is fixed at parse time.

In a database environment where schemas contain sensitive production data, this is not a theoretical concern. Bind variables are not just a performance optimization; they are the boundary between statement text and statement data.

## What schema-aware AI does differently

Veesker's AI layer sends your Oracle server version and schema context to the model alongside the query. That context change affects what the model generates.

When the model knows it is writing PL/SQL for Oracle 19c, it knows that static SQL is preferable to dynamic SQL for fixed-structure queries, and that dynamic SQL requires the `USING` clause for bind variables. It knows that the correct idiom for parameterized queries in Oracle PL/SQL is not `||` concatenation — not because it was told "don't do that," but because the grounding shifts the distribution toward Oracle-correct patterns.

There is a practical illustration. Ask a generic assistant to write a cursor loop filtering by department. You will often get:

```sql
FOR rec IN (SELECT * FROM employees WHERE dept_id = ' || p_dept || ') LOOP
```

Ask the same question in Veesker's query window, where the schema is loaded and the server version is Oracle 19c, and you get:

```sql
FOR rec IN (SELECT * FROM employees WHERE dept_id = p_dept) LOOP
```

Static SQL, implicit bind variable, no string interpolation, no shared pool pollution. The difference is not a different model — it is different context feeding the same model.

The Cloud layer (coming H2 2026) adds execution feedback: the AI can look at `V$SQL` metrics for the generated statements to confirm cursor sharing is working as expected, closing the loop between code generation and runtime behavior.

## When dynamic SQL is genuinely necessary

Dynamic SQL is occasionally the right tool. When the table name is variable, when the ORDER BY column is user-selected at runtime, when a WHERE clause needs to be assembled from optional filter parameters — those cases legitimately require `EXECUTE IMMEDIATE` or `DBMS_SQL`.

The rules in those cases:
- Put literals into the statement text only when they represent structure (table names, column names, operators). These cannot be bind variables.
- Put values into `USING` bind variables, always. Every filter value, every parameter, every threshold.
- Avoid `cursor_sharing = FORCE` as a crutch. It masks the problem without fixing it.

A practical test: if the only thing changing between invocations is a value (not a structural element), it should be a bind variable. If that value is instead concatenated into the SQL string, it is a correctness risk and a performance risk.

## The actual state of play in 2026

Bind variables in Oracle have been the answer for thirty years. The question keeps needing to be asked because the population of people writing SQL keeps changing — new developers, AI-assisted code generation, cross-trained generalists from Postgres who have not run into Oracle's shared pool because Postgres does not have one in the same sense.

An AI tool that knows Oracle specifically — that knows the difference between static SQL and dynamic SQL in PL/SQL, that knows when `USING` is required, that knows why `cursor_sharing = FORCE` is a workaround rather than a solution — will generate Oracle-correct code more reliably than one that treats Oracle as a minor variant of generic ANSI SQL.

That is the model Veesker is built on. Local-first, schema-grounded, version-aware, with AI that knows the shared pool is not decoration.

Download Veesker and write Oracle code that performs as well as it compiles: [veesker.cloud/download](/download).

— *Veesker*
