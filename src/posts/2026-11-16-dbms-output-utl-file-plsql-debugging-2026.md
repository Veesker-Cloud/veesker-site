---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "A practical guide to Oracle's built-in PL/SQL debugging tools: when DBMS_OUTPUT is enough, when to reach for UTL_FILE or autonomous transaction logs, and what DBMS_APPLICATION_INFO gives you for free."
date: "2026-11-16"
slug: "dbms-output-utl-file-plsql-debugging-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "dbms-output"]
translation_slug: "dbms-output-utl-file-debug-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

`DBMS_OUTPUT` is probably the most-used debugging tool in Oracle's history and also the most misunderstood. Every PL/SQL developer has written a `DBMS_OUTPUT.PUT_LINE('got here')` at some point. Most have also cursed at it when the buffer filled, the output disappeared, or nothing showed up because the anonymous block had not finished yet.

This post covers the full landscape of PL/SQL logging and debugging in 2026: what `DBMS_OUTPUT` can and cannot do, when `UTL_FILE` earns its overhead, the autonomous transaction logging pattern that belongs in every DBA's toolkit, and a handful of lesser-known but genuinely useful options that have been in Oracle for years without getting much attention.

## DBMS_OUTPUT: what it actually is

`DBMS_OUTPUT` is a server-side buffer. Calling `PUT_LINE` appends a string to that buffer. The client reads the buffer — typically by calling `DBMS_OUTPUT.GET_LINES` — after the PL/SQL block completes. It is not streaming. It is not real-time. The calling client is the only consumer: SQL*Plus uses `SET SERVEROUTPUT ON` to poll after each statement; SQL Developer and similar tools call `GET_LINES` at statement completion.

This one-shot buffering design is the source of most `DBMS_OUTPUT` frustration:

- A long-running procedure gives you nothing to look at until it finishes (or crashes).
- The default buffer size is 20 KB. Even with the extended parameter `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)`, the buffer is still finite. A procedure that generates output in a tight loop will overflow it and Oracle will raise `ORA-20000: ORU-10027: buffer overflow, limit of <n> bytes`.
- In Oracle 11g the buffer size is capped at 1,000,000 bytes. In 12c and later, `NULL` means unlimited, but "unlimited" is bounded by shared pool memory pressure.
- Output from autonomous transactions in a called procedure does not appear in the calling session's buffer. The two buffers are independent.

For a quick sanity check in a development session — did I reach this point, what is the value of X — `DBMS_OUTPUT` is fine. For anything that runs longer than a few seconds, or anything you need to monitor while it's running, it is the wrong tool.

## UTL_FILE: when you need a trail

`UTL_FILE` writes to files on the Oracle server's filesystem. It is a server-side operation: the file appears on the machine running the Oracle process, not on the machine running your SQL client.

A minimal logging shim:

```sql
PROCEDURE log_msg (
    p_message  IN VARCHAR2,
    p_logfile  IN UTL_FILE.FILE_TYPE
) IS
BEGIN
    UTL_FILE.PUT_LINE(
        p_logfile,
        TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
            || ' | ' || p_message
    );
    UTL_FILE.FFLUSH(p_logfile);  -- flush immediately
END;
```

`FFLUSH` is the detail most examples omit. Without it, Oracle batches writes and you will not see output in the file until the buffer drains or the file handle is closed. During a long migration run, `FFLUSH` is what makes the log file readable in another session while the job is still running.

`UTL_FILE` requires a directory object on the Oracle server:

```sql
CREATE OR REPLACE DIRECTORY log_dir AS '/opt/oracle/diag/logs';
GRANT WRITE ON DIRECTORY log_dir TO the_user;
```

The limitation here is straightforward: the files land on the database server's filesystem. If you're debugging on a development instance you can SSH into, that is tractable. If the database is on a shared server behind a firewall, those files are not visible to you without help from a DBA. And `UTL_FILE` cannot write to a path on your local machine. For teams that do not control the server filesystem, the autonomous transaction log table is a better fit.

## DBMS_APPLICATION_INFO: the overlooked lightweight option

`DBMS_APPLICATION_INFO` does not write to a buffer or a file. It updates the `V$SESSION` and `V$SESSION_LONGOPS` views in real-time. This makes it genuinely useful for monitoring a running job from a second session.

```sql
BEGIN
    DBMS_APPLICATION_INFO.SET_MODULE(
        module_name => 'ETL_LOAD_ORDERS',
        action_name => 'STEP 1: TRUNCATE STAGING'
    );
    -- truncate staging...

    DBMS_APPLICATION_INFO.SET_ACTION('STEP 2: BULK COLLECT');
    -- bulk collect...

    DBMS_APPLICATION_INFO.SET_ACTION('STEP 3: INSERT FROM STAGING');
    -- final insert...
END;
```

From another session:

```sql
SELECT module, action, status FROM v$session
WHERE username = 'ETL_USER';
```

For long-running jobs, `SET_SESSION_LONGOPS` lets you report percentage completion in `V$SESSION_LONGOPS`, which most Oracle monitoring tools surface directly. The session-level visibility is real-time, requires no buffer, and survives a crash better than a `DBMS_OUTPUT` buffer you cannot read.

## The autonomous transaction logging table

The most robust PL/SQL logging pattern uses an autonomous transaction to write to a logging table independently of the calling transaction's commit/rollback state.

```sql
CREATE TABLE app_log (
    log_id    NUMBER GENERATED ALWAYS AS IDENTITY,
    logged_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    module    VARCHAR2(64),
    severity  VARCHAR2(10),
    message   VARCHAR2(4000)
);

CREATE OR REPLACE PROCEDURE log_to_table (
    p_module   IN VARCHAR2,
    p_severity IN VARCHAR2,
    p_message  IN VARCHAR2
) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
    INSERT INTO app_log (module, severity, message)
    VALUES (p_module, p_severity, p_message);
    COMMIT;  -- commits only the autonomous transaction
END;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` is the key. The procedure opens a separate transaction inside the call, commits it, and returns. If the outer transaction later rolls back, the log rows are unaffected. This is exactly what you want when debugging a failed batch: the log of what happened survives the rollback that cleaned up after the error.

The overhead is real — an autonomous transaction commit for every row is not free. This pattern belongs in exception handlers and major step boundaries, not inside inner loops that execute millions of times. For high-frequency logging, write to a collection in-memory and bulk-insert to the log table in a single autonomous commit at step boundaries:

```sql
-- batch-flush version
PROCEDURE flush_log_buffer (p_buffer IN log_msg_tbl) IS
    PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
    FORALL i IN INDICES OF p_buffer
        INSERT INTO app_log (module, severity, message)
        VALUES (p_buffer(i).module, p_buffer(i).severity, p_buffer(i).message);
    COMMIT;
END;
```

## Conditional compilation and introspection directives

Oracle 10g introduced conditional compilation with `$$PLSQL_LINE`, `$$PLSQL_UNIT`, and the `$IF/$END` construct. In 2026 these are still underused.

```sql
PROCEDURE process_batch (p_id IN NUMBER) IS
BEGIN
    log_to_table(
        'process_batch', 'DEBUG',
        $$PLSQL_UNIT || ':' || $$PLSQL_LINE
            || ' entering with id=' || p_id
    );
    -- ...
EXCEPTION
    WHEN OTHERS THEN
        log_to_table(
            'process_batch', 'ERROR',
            $$PLSQL_UNIT || ':' || $$PLSQL_LINE
                || ' ' || SQLERRM
        );
        RAISE;
END;
```

`$$PLSQL_UNIT` resolves to the procedure name at compile time. `$$PLSQL_LINE` resolves to the source line number. These are compile-time constants — zero runtime overhead beyond the string concatenation — and they give error messages the two things error messages almost never have: who and where.

Using `$IF DBMS_DB_VERSION.VER_LE_11 $THEN ... $END`, you can gate code paths on the database version without runtime version checks. This matters when you maintain packages that run on 11g through 23ai and you want 23ai-specific diagnostics without breaking the 11g build.

## Picking the right tool

A decision guide:

**Quick one-shot check in a short block.** `DBMS_OUTPUT`. Adequate, familiar, no setup.

**Monitor a running job from another session.** `DBMS_APPLICATION_INFO.SET_MODULE` and `SET_ACTION`. Free, real-time, SQL-queryable, survives crashes.

**Durable log that survives rollback.** Autonomous transaction log table. The right answer for batch jobs and ETL.

**Write to a file on the server.** `UTL_FILE`. Use when you need a file artifact or when the target table schema is unavailable. Always call `FFLUSH`.

**Performance profiling.** `DBMS_TRACE` and `DBMS_HPROF` (the hierarchical profiler, available since Oracle 11g). The right tool when you have identified *what* is slow and need to find *where*.

## What Veesker adds

The IDE surfaces `DBMS_OUTPUT` from the connection after each statement execution immediately in the output panel — nothing special there, every tool does it. What is different: Veesker also reads from `V$SESSION` for active connections and can display the current `DBMS_APPLICATION_INFO` module and action live in the session tab. If you're running a job in one tab and want to see its current action without manually writing a `V$SESSION` query in a second tab, the session panel shows it.

For the autonomous transaction logging pattern, the query editor supports auto-refresh intervals as short as one second. Point a query at `app_log` with a recent timestamp filter, enable auto-refresh, and watch rows arrive as the job runs. It is not a streaming log viewer, but it works as one for jobs that log at a human-readable cadence.

The AI layer recognizes `PRAGMA AUTONOMOUS_TRANSACTION` and `DBMS_APPLICATION_INFO` calls in context, so it will not suggest replacing an autonomous transaction log with `DBMS_OUTPUT` — which would silently change rollback semantics — when you ask it to refactor a logging procedure.

Veesker is local-first by design. The IDE runs on your machine, connects directly to Oracle, and processes `DBMS_OUTPUT` and `V$SESSION` data locally. Nothing about your session output or query results passes through Veesker's servers. That matters when the database you're debugging holds production data you are not allowed to export.

`DBMS_OUTPUT` is not going away, and it should not. It is the right tool for a certain class of problem. The mistake is reaching for it when the problem is actually "I need to know what a job is doing while it runs" or "I need a log that survives a rollback." For those cases, Oracle shipped the right tools years ago — most codebases just have not adopted them.

---

Download Veesker for your Oracle development work: [veesker.cloud/download](/download).

— *Veesker*
