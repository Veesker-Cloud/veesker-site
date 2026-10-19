---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "When DBMS_OUTPUT is enough, when UTL_FILE makes sense, and how autonomous-transaction logging tables change the game for PL/SQL debugging in 2026."
date: "2026-10-19"
slug: "dbms-output-utl-file-logging-plsql-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-logging-plsql-2026-pt"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

DBMS_OUTPUT is older than most developers reading this. It shipped with Oracle 7.3, predating JSON, REST, and the entire notion that your database might talk to anything other than another Oracle database. In 2026 it is still the first thing most developers reach for when a PL/SQL package misbehaves. That is not nostalgia — it is often the pragmatic choice. But knowing where DBMS_OUTPUT stops being useful, and what to replace it with, is the difference between a twenty-minute debugging session and a day-long one.

## DBMS_OUTPUT: what it actually is

DBMS_OUTPUT is a buffer. When you call `DBMS_OUTPUT.PUT_LINE('something')`, Oracle writes to an in-memory buffer associated with the current session. That buffer is not flushed to your client until execution finishes — or until you call `DBMS_OUTPUT.GET_LINES` explicitly. It is not a stream. It is not real-time. If your procedure runs for ninety seconds and then errors at the last line, you see all the output at once, after the failure.

This has two practical consequences.

First, **ordering is reliable but timing is not**. Lines appear in insertion order. But if you are trying to understand how long each step takes, DBMS_OUTPUT tells you nothing unless you embed `SYSTIMESTAMP` yourself.

Second, **the buffer has a maximum size**. The default is 20,000 bytes — roughly 300 lines of typical debug output before Oracle starts discarding or raising an error, depending on which version of the ENABLE call you use. You can raise it:

```sql
-- Enable with 1 MB buffer before your test call
EXEC DBMS_OUTPUT.ENABLE(1000000);

BEGIN
  your_package.do_thing(p_id => 42);
END;
/
```

In SQL*Plus and SQLcl, `SET SERVEROUTPUT ON` handles the `GET_LINES` call automatically. In other clients you may need to enable the setting explicitly per session. Most developers forget to call ENABLE at all, and then wonder why their output was silently truncated at line 78.

Veesker enables DBMS_OUTPUT with a 1 MB buffer on every new session. The buffer content appears in the Results panel as execution finishes — no `SET SERVEROUTPUT ON` ritual required.

## When DBMS_OUTPUT is not enough

Two scenarios push you past DBMS_OUTPUT.

**Long-running jobs.** A nightly reconciliation that runs for four hours does not benefit from output you can only read after the fact. If it errors at hour three, you want to know what happened during hours one and two.

**Background processes.** Anything running under DBMS_SCHEDULER, DBMS_JOB, or a database-side APEX background process has no client session attached. There is no socket waiting for `GET_LINES`. DBMS_OUTPUT in those contexts is a black hole: the writes succeed, the buffer fills, and nobody reads it.

## UTL_FILE: file-based logging

UTL_FILE writes directly to the Oracle server's filesystem. Setup requires a directory object granted to the writing schema:

```sql
CREATE OR REPLACE DIRECTORY app_log_dir AS '/opt/oracle/logs/app';
GRANT READ, WRITE ON DIRECTORY app_log_dir TO your_schema;
```

A logging call then looks like this:

```sql
DECLARE
  l_file UTL_FILE.FILE_TYPE;
BEGIN
  l_file := UTL_FILE.FOPEN('APP_LOG_DIR', 'reconcile.log', 'A');
  UTL_FILE.PUT_LINE(
    l_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
      || ' | INFO | batch_id=' || p_batch_id
  );
  -- ... your work here ...
  UTL_FILE.FCLOSE(l_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(l_file) THEN
      UTL_FILE.FCLOSE(l_file);
    END IF;
    RAISE;
END;
```

UTL_FILE writes are visible on the filesystem immediately, which is useful for real-time monitoring via `tail -f` on the database server. The trade-offs are real though:

- The files live on the **database server**, not your workstation. Reading them requires server access, a `UTL_FILE.GET_LINE` wrapper query, or a DBA willing to ship you the log.
- File handles are not transaction-scoped. If the outer transaction rolls back, the log lines already written do not roll back with it. This can be a feature or a liability depending on your debugging goal.
- On Oracle Cloud and fully managed on-premise environments, the filesystem is often inaccessible to application schemas. UTL_FILE is largely an option for self-managed installations where the DBA controls the directory object.

## Logging tables with autonomous transactions

The pattern that survives both scenarios — real-time visibility and background execution contexts — is a dedicated logging table written through an autonomous transaction procedure.

```sql
-- The log table
CREATE TABLE app_log (
  log_id         NUMBER GENERATED ALWAYS AS IDENTITY,
  log_ts         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  log_level      VARCHAR2(10)  NOT NULL,   -- DEBUG, INFO, WARN, ERROR
  module         VARCHAR2(100),
  correlation_id VARCHAR2(64),
  msg            VARCHAR2(4000),
  CONSTRAINT app_log_pk PRIMARY KEY (log_id)
);

-- The logging procedure
CREATE OR REPLACE PROCEDURE app_log_write (
  p_level         IN VARCHAR2,
  p_module        IN VARCHAR2,
  p_msg           IN VARCHAR2,
  p_correlation   IN VARCHAR2 DEFAULT NULL
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (log_level, module, msg, correlation_id)
  VALUES (p_level, p_module, p_msg, p_correlation);
  COMMIT;
END app_log_write;
/
```

`PRAGMA AUTONOMOUS_TRANSACTION` creates a subtransaction that commits independently of the outer one. This means:

- Log rows are visible immediately in other sessions. You can watch them in a separate query window while the main job runs.
- If the outer transaction rolls back due to an error, the log entries survive. That is exactly what you want for post-mortem debugging.
- Scheduled jobs, APEX background processes, and any other serverless PL/SQL execution context can all call the same procedure.

The pattern has one cost: every log write is a separate commit. In a tight loop writing thousands of rows per second, this can become a performance concern. The usual mitigation is a severity threshold — log `ERROR` and `WARN` unconditionally, log `INFO` and `DEBUG` only when a session context or a configuration table says to. A simple implementation:

```sql
-- Check threshold before logging
IF p_level IN ('ERROR', 'WARN')
   OR app_config.log_debug_enabled(p_module) THEN
  app_log_write(p_level, p_module, p_msg, p_correlation);
END IF;
```

## DBMS_APPLICATION_INFO: low-overhead progress tracking

Between DBMS_OUTPUT (nothing until execution ends) and a logging table (a commit per line), there is a middle option: `DBMS_APPLICATION_INFO`.

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'RECONCILE_NIGHTLY',
  action_name => 'STEP 3/7: MATCH_PAYMENTS'
);
```

This writes to the `MODULE` and `ACTION` columns of `V$SESSION`, which any monitoring query can read without logging table overhead:

```sql
SELECT sid, serial#, module, action, seconds_in_wait
FROM   v$session
WHERE  module = 'RECONCILE_NIGHTLY';
```

This is not logging in the traditional sense — it does not capture intermediate values, only progress milestones. But for long-running batch jobs where the operational question is "where is it right now", it costs almost nothing and has been available since Oracle 10g. It pairs well with a logging table: use `SET_MODULE` and `SET_ACTION` for coarse progress, and `app_log_write` for the detail you actually want to debug.

## Structured logging for production

When you move from development debugging to production observability, the logging table pattern evolves toward structured, query-able rows. A bare VARCHAR2 message is adequate for a developer reading it; an operations team needs to filter by batch ID, by error code, by time range.

```sql
ALTER TABLE app_log ADD (
  ctx_json  VARCHAR2(4000)    -- JSON key-value context
);
```

On 21c and later you can use a native `JSON` column type with binary storage and full JSON path indexing. On 19c and earlier, a `VARCHAR2(4000)` column with a function-based index on commonly queried keys is the standard approach:

```sql
CREATE INDEX app_log_batch_idx
  ON app_log (JSON_VALUE(ctx_json, '$.batch_id'));
```

Then log calls carry structured context:

```sql
app_log_write(
  p_level       => 'INFO',
  p_module      => 'RECONCILE',
  p_msg         => 'Matched ' || l_count || ' payments',
  p_correlation => l_batch_id
);

-- Or with explicit JSON context in the msg column
app_log_write(
  p_level => 'ERROR',
  p_module => 'RECONCILE',
  p_msg => JSON_OBJECT(
    'event'    VALUE 'payment_match_failed',
    'batch_id' VALUE l_batch_id,
    'ora_err'  VALUE SQLERRM
  )
);
```

And queries across batches become straightforward:

```sql
SELECT log_ts, module, msg
FROM   app_log
WHERE  correlation_id = '2026-10-19-001'
ORDER  BY log_id;
```

## What Veesker does with this

Veesker surfaces DBMS_OUTPUT in the Results panel automatically. For logging table patterns, the schema browser identifies tables with an identity primary key and a `TIMESTAMP WITH TIME ZONE` column as candidate log tables and offers a live tail view — you open the view from the object tree, set a refresh interval, and watch rows arrive while the job runs in a separate session.

The AI layer is schema-aware. If you ask for help adding debug output to a procedure that already calls `app_log_write`, the suggestion will use that existing procedure rather than inserting a bare `DBMS_OUTPUT.PUT_LINE`. If the procedure is identified as running under a DBMS_SCHEDULER job context — which Veesker infers from the schema — the AI will not suggest DBMS_OUTPUT at all. It knows there is no client session waiting for the buffer.

Oracle observability starts at the query level. Your application logs tell you a request failed. Your PL/SQL logs tell you why, at which step, with which values, and exactly how long ago it went wrong.

---

[Download Veesker](/download) and debug your PL/SQL packages with schema-aware tooling, automatic DBMS_OUTPUT surfacing, and live log table views.

— *Veesker*
