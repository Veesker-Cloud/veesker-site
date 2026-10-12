---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "Four battle-tested PL/SQL logging strategies — and when each one is the right tool for the job."
date: "2026-10-12"
slug: "plsql-logging-debugging-patterns-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "padroes-logging-debugging-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

If you have been writing PL/SQL for any length of time, you know the ritual. Add a `DBMS_OUTPUT.PUT_LINE` at the suspicious line. Run the procedure. Squint at the buffer. Decide whether that value was the one you expected. Add three more lines. Run again. Repeat until the production incident is over or your patience runs out, whichever comes first.

DBMS_OUTPUT is not a bad tool. It is a misused one. Understanding where it stops being useful — and what the alternatives do when DBMS_OUTPUT cannot — makes the difference between a diagnostic session that takes twenty minutes and one that takes a morning.

## What DBMS_OUTPUT actually does, and does not

DBMS_OUTPUT works by appending lines to a session-level memory buffer. Your client polls that buffer after the call completes. Two words in that sentence matter: *session-level* and *after*.

Session-level means the buffer is private. No other session can see it. If you are debugging a procedure invoked by a job, an APEX action, or another application, the output goes into the buffer attached to *that* session. Unless your debugger is attached to the right session, the output goes nowhere you can read it.

After means the client reads on completion. There is no streaming. If your procedure runs for ninety seconds, you see all the output at second ninety-one, not as it runs. More practically: if your procedure raises an unhandled exception before completing, whether you get the buffered lines back depends on the driver and client. Some clients discard the buffer on error; others surface it. You cannot count on it.

The buffer has a configurable size limit. `DBMS_OUTPUT.ENABLE` takes a `buffer_size` parameter defaulting to 20,000 bytes with a practical maximum of 1,000,000. A talkative procedure overflows it silently — no error, just truncated output from a point in time you did not choose.

For interactive development in a single SQL session, DBMS_OUTPUT is exactly right. It requires no setup, leaves no artifacts, and keeps the feedback loop tight. For anything running outside your direct session — jobs, triggers, APEX callbacks, anything asynchronous — it is the wrong layer.

## UTL_FILE: when you need a permanent trail

UTL_FILE opens a file on the database server filesystem and writes to it from PL/SQL. The setup requires a directory object pointing at a server path Oracle has permission to write, but once that is in place, the pattern is straightforward:

```sql
DECLARE
  v_log UTL_FILE.FILE_TYPE;
BEGIN
  v_log := UTL_FILE.FOPEN(
    'LOG_DIR',
    'etl_run_' || TO_CHAR(SYSDATE, 'YYYYMMDD_HH24MI') || '.log',
    'W'
  );
  UTL_FILE.PUT_LINE(
    v_log,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' Starting load'
  );
  -- procedure body
  UTL_FILE.PUT_LINE(
    v_log,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
      || ' Completed: ' || v_rows_loaded || ' rows'
  );
  UTL_FILE.FCLOSE(v_log);
EXCEPTION
  WHEN OTHERS THEN
    UTL_FILE.PUT_LINE(v_log, 'ERROR: ' || SQLCODE || ' ' || SQLERRM);
    UTL_FILE.FCLOSE(v_log);
    RAISE;
END;
```

The advantage over DBMS_OUTPUT is permanence. A file on the server is still there if the session ends unexpectedly. It can be tailed in real time if you have OS access to the database host. It is not tied to the life of the client session.

The disadvantages are practical. You need OS-level access to read the log, or a second mechanism to pull file contents back into SQL. Directory object setup is a DBA task on shared or managed systems. And the file write, while generally fast, is not zero-cost in tight loops over large datasets.

UTL_FILE earns its place in batch ETL, scheduled jobs, and any procedure that runs without a live user session watching. For day-to-day interactive debugging, it is more setup than the job warrants.

## The logging table with AUTONOMOUS_TRANSACTION

The pattern that survives both cases — interactive and asynchronous, normal completion and exception paths — is a logging table backed by an autonomous transaction procedure. The key pragma is `PRAGMA AUTONOMOUS_TRANSACTION`.

```sql
CREATE TABLE app_log (
  log_id    NUMBER GENERATED ALWAYS AS IDENTITY,
  log_ts    TIMESTAMP(6) DEFAULT SYSTIMESTAMP NOT NULL,
  module    VARCHAR2(128),
  level     VARCHAR2(10),
  message   VARCHAR2(4000),
  session_id NUMBER
);

CREATE OR REPLACE PROCEDURE log_event (
  p_module  IN VARCHAR2,
  p_level   IN VARCHAR2,
  p_message IN VARCHAR2
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (module, level, message, session_id)
  VALUES (
    p_module, p_level, p_message,
    SYS_CONTEXT('USERENV', 'SID')
  );
  COMMIT;
END;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` makes every INSERT happen in a completely separate transaction from the caller. When the calling procedure rolls back — on an exception, on a deliberate `ROLLBACK` — the log rows survive. That is the capability DBMS_OUTPUT cannot provide: a crashed procedure leaves no output buffer behind, but a logging table with this pragma leaves a full record of what happened right up to the point of failure.

The INSERT is cheap, but the table needs basic maintenance to stay that way. A monthly partition on `LOG_TS`, or a scheduled job that deletes rows older than thirty days, is the standard setup. An index on `(MODULE, LOG_TS)` covers the queries you will actually run: "show me all errors in the nightly ETL from last Tuesday."

Reading back is plain SQL. No OS access needed. Works from any session, any tool, any report running against the same schema.

## DBMS_APPLICATION_INFO: instrumentation without output

If you care about what is running *now* — during execution, not after it — `DBMS_APPLICATION_INFO` is the piece the output patterns above do not cover. It writes metadata directly into `V$SESSION`.

```sql
PROCEDURE load_orders (p_batch_id IN NUMBER) AS
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('NIGHTLY_ETL', 'Loading orders');
  DBMS_APPLICATION_INFO.SET_CLIENT_INFO('Batch: ' || p_batch_id);

  -- load work here

  DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
END;
```

Any DBA with access to `V$SESSION` can now see exactly which module and action each session is running, without the procedure producing any output at all. For long-running jobs, this is how you answer the question "is it still running, and where is it?" without tailing a log file or polling application tables. Enterprise Manager, OEM Grid Control, and Veesker's session monitor all surface `MODULE`, `ACTION`, and `CLIENT_INFO` in the active sessions list.

The overhead is essentially zero: a write to a shared memory structure in the SGA. There is no reason not to set this in every top-level procedure entry point.

## Conditional compilation: debug builds without dead code

Oracle's conditional compilation, introduced in 10g, lets you define debug sections that compile out entirely in production. The syntax uses inquiry directives and the `CC_FLAGS` compiler parameter.

```sql
CREATE OR REPLACE PROCEDURE process_order (p_order_id IN NUMBER) AS
  v_total NUMBER;
BEGIN
  SELECT SUM(line_amount) INTO v_total FROM order_lines WHERE order_id = p_order_id;

  $IF $$DEBUG $THEN
    log_event('PROCESS_ORDER', 'DEBUG',
      'p_order_id=' || p_order_id || ' v_total=' || v_total);
  $END

  -- rest of procedure
END;
```

Compile without the `DEBUG` flag and the PL/SQL compiler elides those lines entirely. The production binary carries zero overhead from the instrumentation. Recompile with `ALTER PROCEDURE process_order COMPILE PLSQL_CCFLAGS='DEBUG:TRUE'` and the logging activates immediately without touching the source file.

This is more disciplined than comment-toggling or the common `g_debug BOOLEAN := FALSE` package variable trick, because it is a compiler guarantee rather than a runtime condition. It is also more explicit: someone reading the code six months from now sees a conditional compilation block and knows immediately that it is a diagnostic path, not production logic.

## What a good IDE contributes here

Most of the above is standard Oracle, documented for decades and available on every version from 10g forward. The difference a well-designed IDE makes is not in the mechanism but in the visibility.

When Veesker's output panel is live, DBMS_OUTPUT lines appear as each statement completes — not buffered until the end of the script. App log queries run as inline quick queries against the same connection, with keyboard access from the procedure you are editing. Session metadata from `V$SESSION` — including `MODULE`, `ACTION`, and `CLIENT_INFO` — surfaces in the connection tab header, so you can see what a concurrent session is doing without switching tools.

These features do not change the underlying Oracle behavior. They reduce the round-trip between writing a log statement and seeing its output, which is where most of the actual friction lives on a busy debugging session.

Community Edition is Apache 2.0 and free to download for Windows, macOS, and Linux. It works offline, never phones home, and supports 9i through 26ai on the same connection panel. Grab it at [veesker.cloud/download](/download) and have the full logging picture in front of you the next time something in PL/SQL goes sideways.

— *Veesker*
