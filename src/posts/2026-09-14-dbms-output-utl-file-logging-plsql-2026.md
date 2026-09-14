---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "A practical field guide to PL/SQL debugging and logging: from DBMS_OUTPUT basics to structured logging tables, DBMS_APPLICATION_INFO, and capturing stack traces with FORMAT_ERROR_BACKTRACE."
date: "2026-09-14"
slug: "dbms-output-utl-file-logging-plsql-2026"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "logging", "developer-tools"]
translation_slug: "dbms-output-utl-file-padroes-log-plsql-2026"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

PL/SQL has no debugger in the Python or Go sense: no `pdb`, no `dlv`, no stepping through a loop in a terminal attached to the running process. What it has is a set of built-in packages that have been logging, tracing, and surfacing state since the Oracle 7 era — and a handful of patterns that evolved around them. In 2026, those patterns still matter, and understanding their limits is the first step to using them well.

This post covers the core toolkit — DBMS_OUTPUT, UTL_FILE, and logging tables — then moves to the less-discussed corners: DBMS_APPLICATION_INFO for real-time session visibility, DBMS_UTILITY for proper stack traces, and the composite pattern that holds up when you are debugging a scheduled job with no interactive session attached.

## DBMS_OUTPUT: the workhorse with three catches

`DBMS_OUTPUT.PUT_LINE` is the first thing every Oracle developer learns and the thing they reach for when something breaks. It is always available, requires no privilege grants beyond the ability to execute the package, and produces output that appears in a client's query window without any setup beyond enabling the package.

The catch that trips people up most often is that DBMS_OUTPUT is a server-side buffer. Lines accumulate in that buffer during execution; they are not streamed to the client in real time. If your procedure runs for ninety seconds before raising an error, you see the output only after the error surfaces — or not at all, if the session is interrupted before the client flushes the buffer.

The second catch is the buffer limit. The default maximum is 20,000 lines. Raise it at the start of any long-running session:

```sql
EXEC DBMS_OUTPUT.ENABLE(buffer_size => NULL);
```

`NULL` removes the explicit cap. Oracle imposes a hard internal ceiling around one million lines, but the common failure mode is hitting the default 20,000 limit mid-run and getting `ORA-20000: ORU-10027: buffer overflow`. Setting it to `NULL` at session start costs nothing and prevents a frustrating interruption.

The third catch is availability. DBMS_OUTPUT is silently discarded when there is no interactive client session — scheduled jobs run by DBMS_SCHEDULER produce no visible output through this package at all. If you are debugging a job chain that runs at 2 AM, DBMS_OUTPUT is not the tool for the job.

## UTL_FILE: output to the filesystem

When you need persistence across session boundaries, or logging from scheduled jobs where DBMS_OUTPUT is unavailable, `UTL_FILE` is the standard answer. The package lets PL/SQL open, write, and close OS-level files in directories that have been pre-approved by a DBA using `CREATE OR REPLACE DIRECTORY`.

A minimal but complete pattern:

```sql
DECLARE
  fh UTL_FILE.FILE_TYPE;
BEGIN
  fh := UTL_FILE.FOPEN('LOG_DIR', 'migration_20260914.log', 'A');
  UTL_FILE.PUT_LINE(fh,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3') || ' INFO  migration started'
  );

  -- ... work ...

  UTL_FILE.PUT_LINE(fh,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
    || ' INFO  complete, ' || v_row_count || ' rows processed'
  );
  UTL_FILE.FCLOSE(fh);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(fh) THEN
      UTL_FILE.PUT_LINE(fh,
        TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
        || ' ERROR ' || SQLERRM
      );
      UTL_FILE.FCLOSE(fh);
    END IF;
    RAISE;
END;
/
```

Two things worth noting here. First, always close the file handle in the exception block — an unclosed handle leaks an OS resource and can prevent other processes from reading the file until the session disconnects. Second, the `UTL_FILE.IS_OPEN` guard is necessary because the handle may not have been successfully opened if the error occurred during `FOPEN` itself.

The directory object `LOG_DIR` must map to a real filesystem path with write permission for the Oracle process user. In containerized or cloud-managed environments, the writable paths are often restricted to `/tmp` or a specific mounted volume; establish this before building your logging strategy around UTL_FILE.

UTL_FILE is the right tool for any output that needs to be readable by something that is not Oracle — ops scripts, external ETL, a tail on the operations dashboard. It is not the right tool if you want the log data to be queryable from SQL.

## Logging tables: the queryable tier

The pattern that scales furthest over time is a dedicated logging table. PL/SQL writes rows into it using an autonomous transaction (`PRAGMA AUTONOMOUS_TRANSACTION`) so that log entries are committed independently of the outer transaction. That autonomy is the point: a migration that rolls back should still leave a complete log trail.

```sql
CREATE TABLE app_log (
  id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  logged_at  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
  session_id VARCHAR2(64),
  module     VARCHAR2(128),
  severity   VARCHAR2(10)  NOT NULL,
  message    CLOB,
  err_code   NUMBER,
  backtrace  CLOB
);

CREATE OR REPLACE PROCEDURE log_msg (
  p_severity IN VARCHAR2,
  p_module   IN VARCHAR2,
  p_message  IN VARCHAR2,
  p_err_code IN NUMBER   DEFAULT NULL,
  p_bt       IN VARCHAR2 DEFAULT NULL
) AS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (session_id, module, severity, message, err_code, backtrace)
  VALUES (
    SYS_CONTEXT('USERENV', 'SID'),
    p_module,
    p_severity,
    p_message,
    p_err_code,
    p_bt
  );
  COMMIT;
END;
/
```

A caller in an exception handler then does:

```sql
EXCEPTION
  WHEN OTHERS THEN
    log_msg(
      p_severity => 'ERROR',
      p_module   => 'PKG_MIGRATION.run_phase',
      p_message  => SQLERRM,
      p_err_code => SQLCODE,
      p_bt       => DBMS_UTILITY.FORMAT_ERROR_BACKTRACE
    );
    RAISE;
END;
```

That last parameter — `DBMS_UTILITY.FORMAT_ERROR_BACKTRACE` — is worth its own paragraph. Introduced in Oracle 10g Release 2, it returns the full call stack at the point the exception was originally raised, not the point where it was caught. The difference matters enormously: without it, a catch-all handler in the outermost procedure tells you only that something failed at the top level. With it, you see that the error originated in `PKG_UTIL.parse_date` at line 84, called from `PKG_MIGRATION.validate_record` at line 211. It is still underused in codebases that have been around long enough to predate it.

## DBMS_APPLICATION_INFO: visibility in V$SESSION

Everything so far writes output somewhere you read later. `DBMS_APPLICATION_INFO` is different: it writes metadata into the session row in `V$SESSION`, visible in real time to any DBA watching the database.

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'PKG_MIGRATION',
  action_name => 'phase_3_validate'
);
DBMS_APPLICATION_INFO.SET_CLIENT_INFO('batch_id=20260914-001');
```

A DBA watching a long-running job can now query:

```sql
SELECT module, action, client_info,
       elapsed_time / 1000000 AS elapsed_sec
FROM   v$session
WHERE  module LIKE 'PKG%';
```

No log file to tail. No buffer to flush. The current phase and elapsed time are live in the data dictionary.

Set the module at the entry point of each package entry and update the action as you move through phases. Reset both to `NULL` on clean exit:

```sql
DBMS_APPLICATION_INFO.SET_MODULE(NULL, NULL);
```

Leaving stale module/action strings in the row after the call completes is a common oversight that makes V$SESSION-based monitoring misleading — the session looks like it is still running phase 3 of a migration that completed yesterday.

## Composite pattern for scheduled jobs

DBMS_SCHEDULER jobs have no interactive session and no visible DBMS_OUTPUT buffer. A practical logging stack for a job combines all three layers:

1. **DBMS_APPLICATION_INFO** at module/action granularity — visible live from V$SESSION without connecting to the application schema.
2. **Logging table with autonomous transaction** — committed per log call, queryable after the run, survives a rollback of the outer transaction.
3. **UTL_FILE** as the escape hatch — a flat-file log readable from the filesystem even if the database itself is in a degraded state.

The UTL_FILE layer earns its place specifically in disaster scenarios: if you cannot connect to query `app_log`, the file on the filesystem is still there.

For jobs that process large volumes, commit progress checkpoints to the logging table at each batch boundary — every N rows, every phase transition. A job that crashed at 3 AM and left no checkpoints means you are guessing how much of the work was actually committed. A job that logged `processed 450,000 of 1,200,000 rows` at the last checkpoint tells you exactly where to resume.

## Putting the discipline in place

Logging in PL/SQL is optional in a way that it is not in application-layer code. Most Oracle databases have no framework that forces it. Packages compile and run fine with no logging at all.

The discipline comes from the post-mortem: the batch job that produced inconsistent results at 2 AM, the migration that rolled back for reasons nobody can reproduce six months later, the procedure that ran for six hours and nobody knows what it was doing for the first four. In each of those cases, the outcome is the same: reconstruct from whatever state the database happens to be in, because nothing was written while the code was running.

The patterns in this post are not new. They predate most of the tooling in the Oracle ecosystem. They are still the correct answer in 2026 because the debugging problem they solve has not changed: code runs on a remote server, the developer is not there when it fails, and something needs to capture what happened with enough fidelity to diagnose it later.

Build the logging layer before you need it. Add the `FORMAT_ERROR_BACKTRACE` call to your standard exception handler template. Set `DBMS_APPLICATION_INFO` at the start of every entry point that runs long enough to matter.

When the 2 AM incident arrives, you want the log to already be there.

---

[Download Veesker](/download) to instrument and debug your PL/SQL packages in a local-first Oracle IDE with built-in DBMS_OUTPUT integration. The Community Edition is free under Apache 2.0 — no telemetry, no credentials leaving the desktop.

— *Veesker*
