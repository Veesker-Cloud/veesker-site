---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "Three decades of PL/SQL debugging patterns — DBMS_OUTPUT, UTL_FILE, and autonomous-transaction tables — examined through what still works and when each one fails you."
date: "2026-11-02"
slug: "dbms-output-utl-file-plsql-logging-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "dbms-output", "logging"]
translation_slug: "dbms-output-utl-file-depuracao-plsql-2026"
read_minutes: 6
author: "claude-agent"
hero: "/datamap-hero.png"
---

PL/SQL debugging in 2026 starts the same way it did in 1997: `DBMS_OUTPUT.PUT_LINE`. Not because it is the best tool, but because it is always there. No configuration, no grants, no directory object — add a line, run the block, read the buffer. For a quick smoke test on a function that is behaving strangely, that is hard to beat.

But "always there" is not the same as "adequate," and the three patterns that cover real PL/SQL debugging — `DBMS_OUTPUT`, `UTL_FILE`, and autonomous-transaction logging tables — each have a different profile of what they cover and where they let you down. Knowing which one to reach for, and knowing the failure modes of the one you picked, is the kind of thing that separates a PL/SQL developer who writes production code from one who writes code that runs fine in a demo environment and behaves strangely at 3 a.m. in production.

## DBMS_OUTPUT: fast, synchronous, and short

`DBMS_OUTPUT` is a ring buffer that accumulates lines during a PL/SQL session and delivers them to the client when the session ends or when the client calls `DBMS_OUTPUT.GET_LINES`. The immediate implication is that it is not a real-time feed. A procedure that runs for two minutes does not print anything until it finishes. If it raises an unhandled exception and rolls back, the output buffer is discarded with the session context. You see nothing.

The second implication is the buffer limit. The default is 20,000 bytes. You can call `DBMS_OUTPUT.ENABLE(1000000)` to raise it to one million, but that is still finite. A procedure that processes a 500,000-row batch and emits one line per row will overflow the buffer before it finishes and silently truncate the output. Silent truncation is the worst failure mode in a debugging session: you see some lines, they look correct, and you conclude the code is working when the relevant lines are the ones you never saw.

Use `DBMS_OUTPUT` for:

- **Unit-scale smoke tests** on small, fast-running procedures.
- **Interactive SQL sessions** where you want a quick confirmation that a code path was reached.
- **Development-time debugging** where you are running the block yourself and the run time is short.

Do not use it for:

- Long-running batch jobs.
- Error logging that must survive a rollback.
- Any situation where the timing of the output matters.

The rollback durability problem bites developers who know `DBMS_OUTPUT` well but have not thought about it carefully. Inside a transaction that eventually rolls back, all of your `PUT_LINE` calls executed — but they executed in a context that is gone. The buffer goes with it when the session uses implicit teardown (anonymous blocks called over a short-lived connection). This is the moment people discover that their "logging" was never actually saved anywhere.

## UTL_FILE: durable, but you are writing to the server's filesystem

`UTL_FILE` writes text files on the Oracle server's filesystem. That sentence carries the key design implication: the files live on the database server, not on the client machine. Accessing them requires either an OS login to that server or a secondary mechanism to transfer them. In cloud or managed-infrastructure environments where you have no shell on the database host, `UTL_FILE` output becomes difficult to retrieve without additional tooling.

Setting up `UTL_FILE` requires a directory object:

```sql
CREATE OR REPLACE DIRECTORY log_dir AS '/opt/oracle/logs';
GRANT READ, WRITE ON DIRECTORY log_dir TO your_schema;
```

The write pattern is straightforward:

```plsql
DECLARE
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN('LOG_DIR', 'batch_run_20261102.log', 'A');
  UTL_FILE.PUT_LINE(v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' Starting batch...');
  -- ... procedure logic ...
  UTL_FILE.FCLOSE(v_file);
END;
```

The mode argument `'A'` appends to an existing file. `'W'` overwrites. For production logging, append is almost always the right choice — you want a continuous trace across multiple runs rather than a file that starts fresh each time.

`UTL_FILE` survives rollbacks. The file write is an OS operation outside Oracle's transaction mechanism, so even if the PL/SQL block raises an exception and rolls back the DML, the lines already written to the file remain. That durability is the primary reason to prefer it over `DBMS_OUTPUT` for batch jobs.

The failure modes worth knowing:

**Permission errors at the OS level** are not always obvious from the Oracle error message. The legacy init parameter `UTL_FILE_DIR` that some installations still use produces confusing behavior when mixed with directory objects — the two resolution mechanisms do not compose cleanly.

**File locking.** Multiple sessions writing to the same filename simultaneously is not safe. The standard pattern is to include a session ID or timestamp in the filename to guarantee uniqueness per run.

**The file is on the server.** For cloud database services or environments where database host access is restricted, the log file might as well not exist from the developer's perspective. This is not a hypothetical: it is the common case in Oracle Cloud, Exadata Cloud@Customer, and many managed on-premises setups.

## Autonomous transaction logging tables: the pattern that actually scales

The durable, queryable, rollback-safe approach is to write log records into a table using an autonomous transaction. An autonomous transaction is a subtransaction that commits independently of the calling transaction. You can log to it, commit the log record, and the record persists even if the outer transaction rolls back.

The pattern:

```sql
CREATE TABLE plsql_log (
  log_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  log_time   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  session_id NUMBER,
  module     VARCHAR2(100),
  severity   VARCHAR2(10),
  message    CLOB
);
```

```plsql
CREATE OR REPLACE PROCEDURE log_msg(
  p_module   VARCHAR2,
  p_severity VARCHAR2,
  p_message  VARCHAR2
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO plsql_log (session_id, module, severity, message)
  VALUES (SYS_CONTEXT('USERENV', 'SID'), p_module, p_severity, p_message);
  COMMIT;
END;
```

With `PRAGMA AUTONOMOUS_TRANSACTION`, the `COMMIT` inside `log_msg` commits only the insert into `plsql_log`. The calling transaction is unaffected. The log record persists regardless of what the outer transaction does.

This approach opens up querying that `DBMS_OUTPUT` and `UTL_FILE` cannot match: you can join log records against DBA views, filter by session, compare run timings across executions, and pull them into any SQL client. Truncating the table on a retention schedule is straightforward. Adding an index on `(log_time, module)` keeps queries fast even as the table accumulates months of history.

The one cost is a commit per log call. For a hot inner loop processing millions of rows, one autonomous transaction commit per iteration adds real overhead. In that case, batch the writes: accumulate lines in a collection and flush to the log table once every thousand rows rather than once per row.

## DBMS_APPLICATION_INFO: lightweight metadata that you already have

There is a fourth option that many developers overlook: `DBMS_APPLICATION_INFO`. It is not a logging mechanism but a metadata annotation mechanism. You call it to set the module, action, and client info fields on the current session, which are then visible in `V$SESSION`.

```plsql
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'BATCH_RECONCILIATION',
    action_name => 'PHASE_1_EXTRACT'
  );
  -- ... work ...
  DBMS_APPLICATION_INFO.SET_ACTION('PHASE_2_TRANSFORM');
  -- ... more work ...
END;
```

Any DBA monitoring `V$SESSION` or `V$SQL` can see which session is in which phase, which SQL it is executing, and what the current wait event is. The cost is effectively zero — no writes, no commits, no file handles. For long-running batch jobs where you want operational visibility without log volume, annotating phases with `DBMS_APPLICATION_INFO` costs almost nothing and surfaces exactly what a DBA needs to answer "is that batch job stuck, or is it still processing?"

It does not replace logging. It complements it: your autonomous transaction log captures what happened row by row; `DBMS_APPLICATION_INFO` tells a monitoring session what is happening right now.

## Choosing the right tool

The decision is not complicated once the properties are laid out:

| Situation | Tool |
|---|---|
| Quick dev-time smoke test, short procedure | `DBMS_OUTPUT` |
| Production batch, durability required, server filesystem accessible | `UTL_FILE` |
| Production batch, rollback-safe, queryable, cloud or managed infra | Autonomous transaction log table |
| Long-running job, operational monitoring without log volume | `DBMS_APPLICATION_INFO` |

In practice, the right answer for any production PL/SQL codebase is the autonomous transaction table with `DBMS_APPLICATION_INFO` annotations layered on top. `DBMS_OUTPUT` stays in the development loop where its simplicity is a genuine virtue. `UTL_FILE` belongs for batch jobs that run on infrastructure with accessible server filesystems and require line-by-line trace files that operators can read directly.

Veesker's query window displays `DBMS_OUTPUT` results automatically — enable the buffer in one click, run your block, and the output appears in a dedicated panel beneath the editor. The result grid shares the same connection, so querying your `plsql_log` table sits two keystrokes from reading the output buffer. The connection's version context is always visible, which matters when you are debugging on an 11g system where some `UTL_FILE` subprogram signatures differ from the 19c docs you are reading.

Veesker is local-first by design: the IDE works fully offline, credentials stay in the OS keychain, and nothing leaves the desktop unless you explicitly enable Cloud features. The Community Edition is Apache 2.0 and available now. The Cloud layer — which will add managed log aggregation and cross-session query history — is coming in H2 2026.

---

[Download Veesker](/download) and get `DBMS_OUTPUT` output, `UTL_FILE` query results, and `V$SESSION` monitoring in one window, connected to every Oracle version you support.

— *Veesker*
