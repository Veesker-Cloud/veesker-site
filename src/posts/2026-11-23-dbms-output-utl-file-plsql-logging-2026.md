---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "A practical guide to PL/SQL debugging patterns — from DBMS_OUTPUT basics through UTL_FILE, DBMS_APPLICATION_INFO, and autonomous-transaction log tables."
date: "2026-11-23"
slug: "dbms-output-utl-file-plsql-logging-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "pl-sql", "debugging", "logging", "dbms-output"]
translation_slug: "dbms-output-utl-file-debug-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

PL/SQL developers in 2026 still reach for the same debugging toolkit they used in 2010. That is not a failure of imagination. It is a reflection of what actually works in production environments where you cannot attach a debugger, cannot replicate the data locally, and cannot afford the overhead of a full APM agent in the hot path. DBMS_OUTPUT, UTL_FILE, and a hand-rolled log table are durable precisely because they impose near-zero overhead on the database engine and require no infrastructure beyond the database itself.

This post maps the tool for each situation, shows the patterns that hold up at scale, and flags the traps that most tutorials gloss over.

## DBMS_OUTPUT: fast but bounded

DBMS_OUTPUT is Oracle's closest analog to `printf`. You call `DBMS_OUTPUT.PUT_LINE`, the message accumulates in a session-scoped buffer, and your client fetches the buffer after execution completes. That last clause is the first trap: **you do not see output mid-execution**. If a PL/SQL block runs for three minutes, nothing appears until it finishes or errors. For long-running batch jobs, that makes it effectively useless as a real-time progress signal.

The buffer has a cap. The default is 20,000 bytes; you can raise it with `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)`, but there is an upper bound near 1 MB that varies by version. Any output beyond the buffer is silently discarded — no exception, no truncation marker, no warning. If you are logging a 50-step batch and only see 30 lines, the buffer may have overflowed well before the last readable line.

```sql
BEGIN
  DBMS_OUTPUT.ENABLE(buffer_size => 1000000);
  FOR i IN 1 .. 100 LOOP
    DBMS_OUTPUT.PUT_LINE(
      TO_CHAR(SYSTIMESTAMP, 'HH24:MI:SS.FF3') || ' step ' || i
    );
  END LOOP;
END;
/
```

Include timestamps in the message, not just sequence numbers. When correlating DBMS_OUTPUT against a trace file or an AWR report, bare `step 7` is useless without knowing when step 7 ran.

Where DBMS_OUTPUT earns its place: **interactive debugging**. Quick "is this branch even being reached?" checks. Verifying cursor output on a small dataset. Watching a stored procedure return a calculated value before wiring it into a larger job. For anything that runs unattended or longer than a minute, reach for something else.

## UTL_FILE: persistent logging to disk

UTL_FILE writes to files on the database server's filesystem. The file persists after your session ends, it is not bounded by a session buffer, and you can open the same file from multiple sessions in append mode. Those properties make it useful for batch job logs that survive a session disconnect or a process restart.

The required setup: an Oracle DIRECTORY object pointing at a filesystem path, with the executing account granted READ and WRITE on that directory.

```sql
-- DBA setup, once
CREATE OR REPLACE DIRECTORY LOG_DIR AS '/var/oracle/logs/app';
GRANT READ, WRITE ON DIRECTORY LOG_DIR TO app_owner;
```

A minimal logging procedure:

```sql
CREATE OR REPLACE PROCEDURE write_log(
  p_severity IN VARCHAR2,
  p_message  IN VARCHAR2
) AS
  v_file UTL_FILE.FILE_TYPE;
BEGIN
  v_file := UTL_FILE.FOPEN(
    location     => 'LOG_DIR',
    filename     => 'app_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log',
    open_mode    => 'A',
    max_linesize => 32767
  );
  UTL_FILE.PUT_LINE(
    v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
      || ' [' || RPAD(p_severity, 5) || '] '
      || p_message
  );
  UTL_FILE.FCLOSE(v_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_file) THEN
      UTL_FILE.FCLOSE(v_file);
    END IF;
END;
/
```

Two patterns in that procedure that matter in production. First, **daily rotation by date in the filename**: one log file per day, named `app_20261123.log`. Rotation by time is free and automatic; cleanup is a DBA cron job that can run outside Oracle. Second, the `EXCEPTION` block that swallows UTL_FILE errors. A logging call that fails and propagates an exception is worse than a logging call that silently fails — the business process should not die because the log directory ran out of space.

The common trap with UTL_FILE is the directory permission model. If the DBA creates the directory object pointing at `/var/oracle/logs/app` but the Oracle OS user does not have write permission to that filesystem path, every write fails at the OS level and the error surfaces as `UTL_FILE.INVALID_PATH` or `UTL_FILE.ACCESS_DENIED`. Separating "Oracle directory object exists" from "OS path is writable by the oracle user" resolves most of these failures immediately.

## DBMS_APPLICATION_INFO: lightweight session tagging

Before logging anything to a file or a table, it is worth instrumenting the session itself. `DBMS_APPLICATION_INFO.SET_MODULE` writes the current operation and action name into the session row in `V$SESSION`. That information is visible to DBAs monitoring active sessions, appears in AWR and ASH reports, and costs essentially nothing.

```sql
BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE(
    module_name => 'INVOICE_BATCH',
    action_name => 'load_invoice_lines'
  );
  -- do the work
  DBMS_APPLICATION_INFO.SET_ACTION('reconcile_totals');
  -- next phase
  DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
END;
/
```

The module and action columns appear in `V$SESSION.MODULE` and `V$SESSION.ACTION`, in AWR top SQL reports grouped by module, and in ASH data via `DBA_HIST_ACTIVE_SESS_HISTORY`. If a DBA is asked "what was the batch doing at 14:32?" and the batch set its module correctly, the answer is in the history views without any application-level log parsing.

This is the most underused of the three patterns. It costs nothing, it is not a network call, and it plugs the batch process into the Oracle monitoring infrastructure the DBA is already watching.

## Rolling your own log table

For structured log data that needs to survive indefinitely, be queryable with SQL, and be visible to multiple users simultaneously, a log table beats UTL_FILE. The key ingredient is `PRAGMA AUTONOMOUS_TRANSACTION`: the INSERT and COMMIT in the log procedure happen in an independent transaction, so they persist even if the calling transaction rolls back.

```sql
CREATE TABLE app_log (
  log_id    NUMBER         GENERATED ALWAYS AS IDENTITY,
  log_time  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  severity  VARCHAR2(10)   NOT NULL,
  module    VARCHAR2(100),
  message   VARCHAR2(4000),
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
)
ORGANIZATION INDEX
COMPRESS ADVANCED LOW;
```

```sql
CREATE OR REPLACE PROCEDURE log_msg(
  p_severity IN VARCHAR2,
  p_module   IN VARCHAR2 DEFAULT NULL,
  p_message  IN VARCHAR2
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (severity, module, message)
  VALUES (p_severity, p_module, p_message);
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/
```

`ORGANIZATION INDEX` and `COMPRESS ADVANCED LOW` are worth noting for a table that will grow continuously. An index-organized table eliminates the row-level overhead for a table whose only access pattern is "INSERT and query by time range." Advanced Low compression (available from 12c onward) reduces storage for the repetitive severity and module strings without measurable write overhead.

The practical limit: very high-frequency logging — thousands of inserts per second — will generate contention on the index leaf blocks. For that volume, write to UTL_FILE and ingest the file into the log table with an external table or a background job. The table is for correlation and audit; the file is for high-velocity throughput.

## How Veesker integrates with these patterns

Veesker displays DBMS_OUTPUT inline in the SQL worksheet. The buffer is fetched automatically after each anonymous block execution and shown in a panel beneath the results, with timestamps preserved. You do not need to call `DBMS_OUTPUT.GET_LINE` manually or switch to a SQL*Plus session to see output.

For log tables, the schema browser understands `app_log`-style structures and surfaces them in autocomplete context when you are writing queries against `V$SESSION` or AWR views. The AI layer, grounded in the connected database version and schema, suggests the correct `PRAGMA AUTONOMOUS_TRANSACTION` pattern rather than the common mistake of a regular transaction that inadvertently commits the calling transaction as a side effect. The IDE runs locally — the schema analysis and AI grounding happen on your machine, without schema metadata leaving the desktop.

Structured log querying — correlating `app_log` rows with `V$SESSION` state at the time of execution — is a feature the Cloud layer will support with schema-aware queries. Coming Soon, H2 2026.

## The right tool for the situation

| Situation | Pattern |
|---|---|
| Interactive debugging, short runs | DBMS_OUTPUT |
| Batch job progress, server-side persistence | UTL_FILE |
| Session visibility for DBA monitoring | DBMS_APPLICATION_INFO |
| Queryable, durable, multi-user log | Autonomous-transaction log table |

None of these is new. The discipline is knowing which one fits the situation, combining them deliberately — set the module with APPLICATION_INFO, write to the table with the autonomous procedure, keep DBMS_OUTPUT for the interactive session — and not treating a print statement as a production logging strategy.

Download Veesker to work with these patterns in an IDE that understands them: [veesker.cloud/download](/download).

— *Veesker*
