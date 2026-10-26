---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "DBMS_OUTPUT still works, UTL_FILE still runs, but the way you stitch them together has changed. A field guide to PL/SQL logging patterns that survive production."
date: "2026-10-26"
slug: "dbms-output-utl-file-plsql-logging-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "dbms-output", "utl-file"]
translation_slug: "dbms-output-utl-file-logging-plsql-2026"
read_minutes: 6
author: "claude-agent"
hero: "/datamap-hero.png"
---

Every PL/SQL codebase has the same confession buried somewhere in it: a line that reads `DBMS_OUTPUT.PUT_LINE('here 1')`. Sometimes it has a timestamp. Mostly it doesn't. Often it was left in by accident and silently does nothing in production because no client ever reads it.

Logging in PL/SQL is solved and unsolved at the same time. The primitives have been stable for two decades. The patterns for using them in a production-grade way are scattered across forum threads, internal wikis, and the tribal knowledge of DBAs who inherited a codebase they didn't write. This post collects the patterns that actually hold up.

## What DBMS_OUTPUT actually is

DBMS_OUTPUT is a server-side buffer, not a stream. When you call `DBMS_OUTPUT.PUT_LINE`, the string goes into an in-memory buffer attached to your session. Nothing travels to the client until the PL/SQL block finishes executing and the client calls `DBMS_OUTPUT.GET_LINES` (or its older `GET_LINE` variant). SQL Developer, SQLcl, and SQL*Plus poll for output after execution. If your tool doesn't poll, you see nothing.

The consequences of this architecture are practical.

The buffer is bounded. The default is 20,000 bytes. You set it explicitly with `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)` — up to one million bytes, or `NULL` for unlimited. If you're logging inside a loop that iterates ten thousand times and forget to set an explicit size, you'll get `ORA-20000: ORU-10027: buffer overflow` partway through — which surfaces as a surprise error in the middle of what looks like a different piece of logic.

It is session-scoped. A package running via a DBMS_SCHEDULER job has no client attached. `DBMS_OUTPUT.PUT_LINE` inside a scheduled job writes to a buffer that nobody ever reads. The output evaporates when the job session ends.

It has no timestamp, no severity level, no caller information. Everything is a string. This is fine for interactive development. It is not fine for debugging what happened in a batch job last Tuesday.

None of this makes DBMS_OUTPUT useless. It is the right tool for interactive work: write a block, run it, read the output. For everything else, you need something different.

## UTL_FILE: persistent, but with constraints

UTL_FILE writes to OS-level files via Oracle directory objects. The basic pattern:

```sql
DECLARE
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN(
    location     => 'LOG_DIR',       -- a DIRECTORY object name, not a path
    filename     => 'import_job.log',
    open_mode    => 'A',             -- append
    max_linesize => 32767
  );
  UTL_FILE.PUT_LINE(
    v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' [INFO] started'
  );
  UTL_FILE.FCLOSE(v_file);
END;
```

Two things are worth emphasising. The `location` parameter is a directory **object name**, not a filesystem path. If you pass a filesystem path, you get legacy `UTL_FILE_DIR` behavior — a pre-12c mechanism that requires a database restart to configure and is disabled in many hardened environments. Use `CREATE DIRECTORY LOG_DIR AS '/opt/oracle/logs'` and grant `READ, WRITE ON DIRECTORY` to the relevant schema.

The `max_linesize` parameter caps each individual line write, not the file. If your log message exceeds `max_linesize`, Oracle raises `VALUE_ERROR`. Set it to 32767 (the maximum) unless you have a specific reason to limit it.

UTL_FILE is the right choice when you need the log to outlive the session, or when you're running a scheduled batch and want a file the DBA can inspect directly. Its weakness is operational: reading those files from inside Oracle requires UTL_FILE reads or an external table, and rotating or archiving them is an OS-level concern outside the database's control.

## The logging table pattern with autonomous transactions

The most flexible logging target is a dedicated table, written via an autonomous transaction:

```sql
CREATE TABLE plsql_log (
  log_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  log_ts     TIMESTAMP DEFAULT SYSTIMESTAMP,
  session_id NUMBER,
  module     VARCHAR2(64),
  severity   VARCHAR2(10),
  message    CLOB
);

CREATE OR REPLACE PROCEDURE log_msg(
  p_module   VARCHAR2,
  p_severity VARCHAR2,
  p_message  CLOB
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO plsql_log (session_id, module, severity, message)
  VALUES (SYS_CONTEXT('USERENV', 'SID'), p_module, p_severity, p_message);
  COMMIT;
END;
/
```

The `PRAGMA AUTONOMOUS_TRANSACTION` is the essential detail. Without it, the log insert participates in the caller's transaction. If the calling procedure rolls back because it hit an error, the log row disappears with it. An autonomous transaction commits independently, so the error record survives the rollback. This is what makes the pattern useful for debugging failures rather than just tracing successful paths.

The `SYS_CONTEXT('USERENV', 'SID')` capture ties each row to the session that wrote it, which matters when multiple sessions run the same procedure simultaneously.

A practical enhancement: include the module and action from `DBMS_APPLICATION_INFO` in the log row so you can correlate log entries with AWR data and `V$SESSION` without any additional joins.

## DBMS_APPLICATION_INFO: the underused primitive

`DBMS_APPLICATION_INFO` lets running code report its own context into `V$SESSION`. The three key calls:

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'NIGHTLY_BATCH',
  action_name => 'LOADING_ORDERS'
);
DBMS_APPLICATION_INFO.SET_CLIENT_INFO('step 4 of 7');
```

This costs essentially nothing. The strings appear immediately in `V$SESSION.MODULE`, `V$SESSION.ACTION`, and `V$SESSION.CLIENT_INFO`. A DBA watching a slow session can see not just that your procedure is running, but exactly where in the procedure it is.

The discipline is to call `SET_MODULE` at the entry point of every significant procedure and `SET_ACTION` at each logical stage. At the end, reset both to `NULL` or to the parent context. When you later look at ASH data for a session that was slow last Tuesday, the MODULE and ACTION columns tell you where in the code the time was spent — without any additional logging overhead.

AWR and ASH aggregate by module and action. If your critical nightly batch is named `NIGHTLY_BATCH` consistently, you can query its execution time history from `DBA_HIST_ACTIVE_SESS_HISTORY` without knowing the session IDs in advance and without joining to anything exotic.

## V$SESSION_LONGOPS for bulk operations

If your procedure processes a known number of rows, report progress via `DBMS_APPLICATION_INFO.SET_SESSION_LONGOPS`. This feeds `V$SESSION_LONGOPS`, which monitoring tools surface as a progress indicator.

```sql
DECLARE
  v_rindex    BINARY_INTEGER := DBMS_APPLICATION_INFO.SET_SESSION_LONGOPS_NOHINT;
  v_slno      BINARY_INTEGER;
  v_totalwork NUMBER;
  v_sofar     NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_totalwork FROM orders_staging;

  FOR rec IN (SELECT order_id FROM orders_staging) LOOP
    -- process rec
    v_sofar := v_sofar + 1;
    DBMS_APPLICATION_INFO.SET_SESSION_LONGOPS(
      rindex    => v_rindex,
      slno      => v_slno,
      op_name   => 'Order staging load',
      sofar     => v_sofar,
      totalwork => v_totalwork,
      units     => 'rows'
    );
  END LOOP;
END;
```

Pass `v_rindex` and `v_slno` back on each call and Oracle updates the existing `V$SESSION_LONGOPS` row rather than inserting a new one. The view stays readable for monitoring queries that fire repeatedly during the run.

## Pulling it together in a real codebase

A production PL/SQL codebase handling long batch jobs typically combines all of these layers:

- `DBMS_APPLICATION_INFO` for module and action tracking — always, it's free and visible in ASH
- `V$SESSION_LONGOPS` for progress on bulk operations — where the total work is known in advance
- Autonomous-transaction log table for detailed event records — replaces `DBMS_OUTPUT` calls in scheduled code
- UTL_FILE as a secondary sink when the DBA needs a file to archive or hand to a vendor

`DBMS_OUTPUT` keeps its place in interactive development and unit-level debugging, where the call terminates immediately and you want to see the trace without setting anything up.

The common failure is to reach for `DBMS_OUTPUT` everywhere because it's the default, then discover that half your logging is invisible in production contexts and the other half crashes with buffer overflow on large datasets. The patterns above avoid both problems with minimal additional code.

## How Veesker fits in

Veesker surfaces all of these without extra setup. `DBMS_OUTPUT` output from an interactive block is captured and displayed alongside query results — no `SET SERVEROUTPUT ON` toggle required. The session explorer shows `MODULE`, `ACTION`, and `CLIENT_INFO` live for every connected session. Running a procedure that sets `V$SESSION_LONGOPS`? The progress shows up without writing a monitoring query by hand.

Veesker is local-first by design: the desktop IDE connects directly to your Oracle instance, reads what the session reports, and shows it in one place. The Community Edition is free under Apache 2.0 and works on Oracle 9i through 26ai.

If your team runs DBMS_SCHEDULER jobs that currently log to `DBMS_OUTPUT` and you're tired of seeing nothing, the logging table pattern above is a one-afternoon migration. Start there, then open the log table in Veesker's data grid for a live view of what ran.

**[Download Veesker](/download)**

— *Veesker*
