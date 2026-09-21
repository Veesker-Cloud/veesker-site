---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "A practical guide to the three debugging tools every PL/SQL developer reaches for — DBMS_OUTPUT, UTL_FILE, and a log table — and when each one earns its place."
date: "2026-09-21"
slug: "dbms-output-utl-file-plsql-debugging-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "dbms-output", "utl-file"]
translation_slug: "dbms-output-utl-file-depuracao-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

PL/SQL developers have been debugging with `DBMS_OUTPUT.PUT_LINE` since at least Oracle 7. The fact that this approach is still common in 2026 is not a sign of backwardness — it is a pragmatic acknowledgment that the tools available work well within their constraints, and that understanding those constraints is most of the job.

This post covers the three approaches that handle the real range of PL/SQL debugging: `DBMS_OUTPUT` for interactive development, `UTL_FILE` for persistent traces, and a simple log table for everything that needs to survive beyond a session. It also covers where each one breaks, and what you reach for when it does.

## DBMS_OUTPUT: what it is and what it is not

`DBMS_OUTPUT` is a server-side buffer. When you call `DBMS_OUTPUT.PUT_LINE('message')` inside a PL/SQL block, Oracle does not write to any output stream. It appends the string to a session-scoped internal package buffer. Your client tool reads that buffer after execution completes — using `DBMS_OUTPUT.GET_LINE` or `DBMS_OUTPUT.GET_LINES` under the hood — and then displays the results.

This architecture has important implications.

**The buffer is read after the block completes.** If you are watching the client for intermediate output during a long-running procedure, there is none. Lines appear all at once when Oracle returns control to the client. There is no way to flush the buffer mid-execution through standard `DBMS_OUTPUT` calls.

**The buffer has a size limit.** The default is 20,000 bytes. You can raise it with `DBMS_OUTPUT.ENABLE(buffer_size => NULL)` — on Oracle 10g and later, `NULL` removes the cap entirely. On 9i the maximum is one million bytes. Beyond the active limit, new `PUT_LINE` calls raise `ORA-20000: ORU-10027: buffer overflow`.

**The buffer is a package state, not a connection stream.** If your procedure runs inside a scheduled job, a trigger, a function called from a SQL query, or any context without an interactive client attached, `DBMS_OUTPUT` lines disappear without a trace. The job finishes, the function returns, and nothing is logged. This is the failure mode that trips up developers the most.

When none of those constraints bite you — when you are running a block interactively and want to see values after execution — `DBMS_OUTPUT` is effective. It requires no schema objects, no filesystem access, and no special privileges beyond the ability to run PL/SQL. For exploratory development it remains the right default.

### Enabling it in your session

The canonical pattern for an anonymous block:

```sql
BEGIN
  DBMS_OUTPUT.ENABLE(buffer_size => NULL);
  your_procedure(p_id => 42);
END;
/
```

Most tools enable `DBMS_OUTPUT` automatically for interactive sessions. If your client is not showing output, verify that `SET SERVEROUTPUT ON` is in effect (SQL*Plus / SQLcl syntax) or that the equivalent session option is active.

## UTL_FILE: persistent traces to the filesystem

When you need output that survives beyond an interactive session — from a nightly batch job, a long ETL run, a maintenance window — `UTL_FILE` writes directly to files on the database server's filesystem.

The setup requires a directory object, which maps a logical name to a filesystem path on the server:

```sql
-- DBA grants this once
CREATE OR REPLACE DIRECTORY log_dir AS '/var/oracle/logs';
GRANT READ, WRITE ON DIRECTORY log_dir TO app_user;
```

Writing a log file then looks like this:

```sql
DECLARE
  v_fh  UTL_FILE.FILE_TYPE;
  v_ts  VARCHAR2(30);
BEGIN
  v_ts := TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3');
  v_fh := UTL_FILE.FOPEN(
            'LOG_DIR',
            'etl_run_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log',
            'A',
            32767
          );
  UTL_FILE.PUT_LINE(v_fh, v_ts || ' [INFO] Starting batch load');
  -- ... procedure logic ...
  UTL_FILE.PUT_LINE(v_fh, v_ts || ' [INFO] Batch complete');
  UTL_FILE.FCLOSE(v_fh);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_fh) THEN
      UTL_FILE.FCLOSE(v_fh);
    END IF;
    RAISE;
END;
```

A few points to bear in mind.

**The directory name is case-sensitive in FOPEN.** `'LOG_DIR'` and `'log_dir'` resolve to different objects. The convention is uppercase, matching the `CREATE DIRECTORY` object name.

**The `max_linesize` parameter** is the fourth positional in `FOPEN`, not the third — the third is the open mode (`'W'` for write, `'A'` for append, `'R'` for read). Set `max_linesize` to 32767 if you are logging long SQL text or large variable values; the default of 1024 truncates longer lines silently.

**The EXCEPTION block must close the file.** An unclosed file handle persists until the session ends. Always include a `UTL_FILE.IS_OPEN` guard in the exception handler, or the next open attempt may raise `UTL_FILE.INVALID_OPERATION`.

**UTL_FILE writes to the server filesystem, not the client machine.** This is a frequent point of confusion for developers new to it. The file appears on the host running the Oracle instance — which may be a RAC node, an OCI managed database, or a remote server without direct SSH access. When you cannot read the server filesystem directly, a log table is the better option.

## A log table: the durable, queryable alternative

The most flexible approach for production workloads is a dedicated log table. It requires a minimal schema object, works from any execution context — jobs, triggers, autonomous transactions, application code — and the output is queryable with plain SQL.

```sql
CREATE TABLE app_log (
  log_id    NUMBER         GENERATED ALWAYS AS IDENTITY,
  log_ts    TIMESTAMP      DEFAULT SYSTIMESTAMP,
  log_level VARCHAR2(10),
  module    VARCHAR2(100),
  message   CLOB,
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
);
```

The procedure that writes to it uses an autonomous transaction, so that rollbacks in the calling code do not wipe out the diagnostic record of what went wrong:

```sql
CREATE OR REPLACE PROCEDURE log_msg (
  p_level   VARCHAR2,
  p_module  VARCHAR2,
  p_msg     CLOB
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (log_level, module, message)
  VALUES (p_level, p_module, p_msg);
  COMMIT;
END log_msg;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` is the key detail. Without it, the INSERT participates in the caller's transaction. If the calling procedure fails and rolls back, the log row rolls back with it — which is precisely the situation where you most need the record. The autonomous transaction commits independently, so the log entry survives the failure.

Querying recent errors from a live system then becomes:

```sql
SELECT log_ts, log_level, module, SUBSTR(message, 1, 200)
FROM   app_log
WHERE  log_ts > SYSTIMESTAMP - INTERVAL '1' HOUR
ORDER  BY log_ts DESC
FETCH FIRST 50 ROWS ONLY;
```

This query uses `FETCH FIRST N ROWS ONLY`, which requires Oracle 12c or later. On 11g and earlier, the equivalent is:

```sql
SELECT * FROM (
  SELECT log_ts, log_level, module, SUBSTR(message, 1, 200)
  FROM   app_log
  WHERE  log_ts > SYSTIMESTAMP - INTERVAL '1' HOUR
  ORDER  BY log_ts DESC
)
WHERE ROWNUM <= 50;
```

The log table pattern works equally in production, in jobs, in triggers, and in any code that runs without an interactive client. It is the approach Veesker's AI-assisted examples recommend when adding observability to an existing package — because it produces artifacts you can query, index, and retain, rather than output that evaporates between sessions.

## A note on step-through debugging

Oracle's `DBMS_DEBUG` package and its JDWP-based successor enable true step-through debugging of PL/SQL: setting breakpoints, inspecting variables mid-execution, stepping into and over calls. SQL Developer has supported this for years, and other tools have varying levels of support.

The reason most Oracle developers still reach for `PUT_LINE` instead of a debugger comes down to friction. Step-through debugging requires the `DEBUG CONNECT SESSION` and `DEBUG ANY PROCEDURE` privileges, which many organizations do not grant in non-development environments. The debug wire protocol also introduces noticeable latency on remote servers, making it slow for anything but short procedures.

For complex logic running in a job or on a production-adjacent schema, a log table is typically more practical: it is always on, it persists across session and connection boundaries, and querying it with SQL is faster than navigating a debugger UI for a procedure invoked by a scheduler.

## Putting the three together

The working pattern most teams land on looks like this:

- **Interactive development:** `DBMS_OUTPUT` for quick feedback, zero setup.
- **Long-running procedures and jobs:** log table with autonomous transaction, queryable after the fact, survives rollbacks.
- **Situations where schema changes are not possible** — third-party packages you cannot modify, tight schema restrictions, legacy systems: `UTL_FILE` with a server-side directory object as a fallback.

None of these replaces the others. The decision is driven by execution context: if there is no client attached, `DBMS_OUTPUT` is invisible; if there is no server filesystem access, `UTL_FILE` is unreachable. Pick the one that matches where your code runs.

Veesker surfaces `DBMS_OUTPUT` results in a dedicated panel below the query editor, formatted with run timestamps and line counts so output from multiple sequential executions stays distinguishable. For procedures that write to a log table, the schema browser shows the table in context, and the query panel handles both `FETCH FIRST N ROWS ONLY` and the `ROWNUM` subquery form depending on the connected server version — so the tail-style query you write in 23ai also works when you paste it into the 11g connection tab.

The Community Edition is free under Apache 2.0 and ships for Windows, macOS, and Linux — [download it at veesker.cloud/download](/download). If your team needs the managed AI layer for PL/SQL review and refactoring, the Cloud tier launches H2 2026 at $29 USD per seat per month. [Join the waitlist](/#waitlist) to lock founder pricing.

— *Veesker*
