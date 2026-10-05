---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "A practical guide to PL/SQL logging: when DBMS_OUTPUT is enough, when UTL_FILE is better, and how to build a logging framework that survives production."
date: "2026-10-05"
slug: "dbms-output-utl-file-plsql-logging-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-log-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

PL/SQL has had `DBMS_OUTPUT` since Oracle 7. The mechanism is simple: your procedure calls `DBMS_OUTPUT.PUT_LINE`, Oracle buffers the text, and the client drains the buffer after execution completes. It works. It is also a debugging tool that becomes a liability the moment your code moves from a laptop SQL window to a scheduled job, a parallel query slave, or a package that runs inside a trigger.

In 2026 most Oracle shops still have production code that logs to `DBMS_OUTPUT`, and developers who have learned to debug with it because no one gave them a better option. This post is about what the better options are, when each one earns its place, and how the choice you make during development shapes what you can see in production.

## What DBMS_OUTPUT actually is

`DBMS_OUTPUT` is a server-side ring buffer. When your session calls `PUT_LINE`, Oracle appends the text to an in-memory buffer associated with that session. The buffer is not flushed in real time. It is not written to any file. It is not visible to any other session. The client -- SQL*Plus, SQL Developer, Veesker, or any driver that calls `DBMS_OUTPUT.GET_LINES` after execution -- retrieves the accumulated text once the top-level call returns.

The practical consequences:

**The buffer is finite.** The default is 20,000 bytes. You can raise it with `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)`, but the ceiling is 1,048,576 bytes (1 MB) in most Oracle versions. A long-running job that produces more output than the buffer can hold will either truncate or raise `ORA-20000` depending on how the session enabled it.

**Timing is invisible.** Because the client only sees output after execution finishes, you cannot watch progress in real time. A procedure that runs for four minutes gives you four minutes of silence followed by a wall of text. If the procedure crashes at minute three, you might get partial output, or none at all.

**Jobs see nothing.** A DBMS_SCHEDULER job runs in a background session. No interactive client is draining its DBMS_OUTPUT buffer. Every `PUT_LINE` call in a scheduled job is silently discarded.

**Parallel execution loses it.** When Oracle fans a query out to parallel query slaves, each slave has its own session. `DBMS_OUTPUT` messages from the slaves never reach the coordinating session.

For interactive development and ad-hoc scripts, `DBMS_OUTPUT` is perfectly adequate. For anything that runs unattended, it is not a logging mechanism at all.

## UTL_FILE: persistent, but not painless

`UTL_FILE` writes to OS files through Oracle's server process. It has been available since Oracle 7.3 and remains the standard way to produce file-based logs from PL/SQL.

The setup requires a directory object:

```sql
CREATE OR REPLACE DIRECTORY app_log_dir AS '/u01/app/logs';
GRANT READ, WRITE ON DIRECTORY app_log_dir TO app_user;
```

A minimal log procedure looks like this:

```plsql
PROCEDURE write_log(p_message IN VARCHAR2) IS
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN(
    location     => 'APP_LOG_DIR',
    filename     => 'app_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log',
    open_mode    => 'A',
    max_linesize => 32767
  );
  UTL_FILE.PUT_LINE(v_file, TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
    || ' [' || SYS_CONTEXT('USERENV', 'SESSION_USER') || '] '
    || p_message);
  UTL_FILE.FCLOSE(v_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_file) THEN
      UTL_FILE.FCLOSE(v_file);
    END IF;
END;
```

The open-write-close pattern inside a single call is deliberate. Keeping a file handle open across procedure boundaries and exception paths is a reliable way to leak file handles. Oracle limits the number of open file handles per session, and the error that results -- `UTL_FILE.INVALID_OPERATION` -- is not obvious about its cause.

`UTL_FILE` gives you real timestamps, persists across crashes (everything written before the failure is on disk), and works in background jobs. The trade-offs are operational: log rotation is your problem, directory permissions are your problem, and the file lives on the Oracle server's filesystem, which may not be where your log aggregation tooling is watching.

## DBMS_APPLICATION_INFO: the underused option

`DBMS_APPLICATION_INFO` does not write any persistent record. What it does is update the `MODULE`, `ACTION`, and `CLIENT_INFO` columns of `V$SESSION` in real time. Any DBA with access to that view can see what your session is doing right now.

```plsql
PROCEDURE process_batch(p_batch_id IN NUMBER) IS
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'BATCH_PROCESSOR',
    action_name => 'LOADING'
  );
  -- load phase ...

  DBMS_APPLICATION_INFO.SET_ACTION('VALIDATING');
  -- validate phase ...

  DBMS_APPLICATION_INFO.SET_ACTION('COMMITTING');
  COMMIT;

  DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
END;
```

`V$SESSION` is also the source for AWR and ASH sampling. A long-running batch job that populates `MODULE` and `ACTION` correctly will show up in wait analysis reports segmented by those labels. That is worth more than a log file for performance investigations.

## Logging tables: the production pattern

For anything that needs to survive across sessions, be queryable, or feed an alerting system, a logging table is the correct answer.

```sql
CREATE TABLE app_log (
  log_id      NUMBER         GENERATED ALWAYS AS IDENTITY,
  log_ts      TIMESTAMP(6)   DEFAULT SYSTIMESTAMP NOT NULL,
  log_level   VARCHAR2(10)   NOT NULL,
  module_name VARCHAR2(100),
  message     VARCHAR2(4000),
  session_id  NUMBER         DEFAULT SYS_CONTEXT('USERENV', 'SESSIONID'),
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
) COMPRESS FOR OLTP;
```

The critical design decision is the commit strategy. If your log procedure commits after every insert, it will interfere with the calling transaction's rollback behavior. If the calling transaction rolls back on error, all log records from that transaction vanish too -- including the one that would have told you what failed.

The standard solution is an autonomous transaction:

```plsql
PROCEDURE log_event(
  p_level   IN VARCHAR2,
  p_module  IN VARCHAR2,
  p_message IN VARCHAR2
) IS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (log_level, module_name, message)
  VALUES (p_level, p_module, p_message);
  COMMIT;
END;
```

The `PRAGMA AUTONOMOUS_TRANSACTION` makes the log insert run in its own separate transaction context. It commits independently, so a rollback in the calling code does not erase the log entry. The procedure itself cannot see the calling transaction's uncommitted data, which is almost always the right behavior for a log: you want to record that something happened, not read back the state that was being modified.

## Combining the patterns

The approaches are not mutually exclusive. A practical pattern for a complex batch process:

- Use `DBMS_APPLICATION_INFO` throughout so the current phase is always visible in `V$SESSION`.
- Log major lifecycle events (start, end, error) to the logging table via an autonomous transaction procedure.
- Use `DBMS_OUTPUT.PUT_LINE` for developer-time diagnostics behind a conditional: `IF g_debug THEN DBMS_OUTPUT.PUT_LINE(...); END IF;`
- Write to `UTL_FILE` only when the output is intended to be consumed by an external process rather than by a human or a monitoring query.

The conditional `g_debug` flag lets you leave instrumentation in production code without paying for buffer allocation on every call. Set it via a package-level variable that defaults to `FALSE` and can be toggled in a session without recompiling.

## What Veesker adds here

Veesker's output panel drains `DBMS_OUTPUT` in real time during interactive execution -- it calls `DBMS_OUTPUT.GET_LINES` on a short polling interval while your statement runs, so you see output as it is produced rather than after the statement returns. For development and ad-hoc scripts, that changes the experience from "run and wait" to something closer to a live tail.

For logging table output, Veesker's query window lets you keep a live-refreshing query open in a split pane alongside the procedure you are debugging. The schema browser resolves `app_log` (or whatever your table is named) from your connected schema automatically, so you are not reconstructing column names from memory.

The AI layer, when you use it for PL/SQL rewriting, preserves `PRAGMA AUTONOMOUS_TRANSACTION` and `DBMS_APPLICATION_INFO` calls that it finds in the source. Generic code tools tend to remove these as "noise" because they do not understand what they do. Veesker's PL/SQL parser knows what they are.

## The shape of a maintainable logging setup

What the above adds up to: one logging table with an autonomous transaction wrapper, `DBMS_APPLICATION_INFO` on every significant procedure that might appear in AWR or ASH, `DBMS_OUTPUT` behind a debug flag for interactive development, and `UTL_FILE` reserved for cases where an external file consumer is the actual requirement.

That is not a complex architecture. It is a set of decisions made once and applied consistently, and it is the difference between "I have no idea what this job was doing when it failed at 03:00" and "I have a timestamped row in `APP_LOG` and a matching AWR entry for the wait that preceded it."

Download Veesker and work through your existing PL/SQL packages with an IDE that understands what it is reading: [veesker.cloud/download](/download).

— *Veesker*
