---
title: "DBMS_OUTPUT, UTL_FILE, and logging patterns for PL/SQL debugging in 2026"
description: "DBMS_OUTPUT was never a logging system. Here is what to use instead — and when each pattern earns its place in a PL/SQL codebase that needs to survive production."
date: "2026-09-28"
slug: "dbms-output-utl-file-plsql-logging-patterns"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "debugging", "dbms-output", "logging"]
translation_slug: "dbms-output-utl-file-padroes-logging-plsql"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Every PL/SQL developer has been here: a stored procedure runs fine in the IDE and fails silently in a scheduled job. The first instinct is to reach for `DBMS_OUTPUT.PUT_LINE`. The second instinct, a few days later, is to realize that was the wrong tool for a debugging job that needed an actual logging system.

This is not a criticism of `DBMS_OUTPUT`. It is, to borrow language from the Oracle documentation, exactly what it says on the label: output buffering for client tools. The buffer accumulates in the session's memory, the client reads it when the call returns, and nothing persists to disk. That is a reasonable design for an interactive tool. It is a poor design for a batch procedure that fires at 02:00 and fails in a way you need to trace a week later.

The 2026 Oracle PL/SQL stack offers four main patterns for tracing and logging. Each one has a legitimate home. The mistake is reaching for the wrong one.

## Pattern 1: DBMS_OUTPUT — what it is actually good for

`DBMS_OUTPUT` works in exactly one context well: **interactive development in an IDE or SQL*Plus session**. You are writing a procedure, you want to see intermediate state, you call `DBMS_OUTPUT.PUT_LINE`, and your client renders the buffer. That is the contract.

Three things break it in production.

First, the buffer has a hard upper bound. The default is 20,000 bytes; the maximum you can set with `DBMS_OUTPUT.ENABLE(buffer_size => 1000000)` is 1 MB. A batch procedure that loops over ten million rows will silently discard messages past that limit — with no error, no truncation notice, no warning.

Second, nothing is flushed until the call returns. If your procedure hangs mid-execution, the buffer you wanted to inspect is inaccessible. The entire value proposition — intermediate visibility — disappears precisely when you need it most.

Third, `DBMS_OUTPUT` produces no timestamps, no severity levels, and no session context. Correlating output from three parallel sessions running the same procedure is not possible after the fact.

Use `DBMS_OUTPUT` during development. Stop before you commit to production.

## Pattern 2: UTL_FILE — the underrated workhorse

`UTL_FILE` writes to a directory object on the Oracle server's filesystem. It persists, it survives session termination, and it can capture sequential output from a batch job that runs unattended.

The setup requires a `CREATE DIRECTORY` grant and write access on the server path:

```sql
CREATE OR REPLACE DIRECTORY app_logs AS '/opt/oracle/app_logs';
GRANT WRITE ON DIRECTORY app_logs TO app_user;
```

A minimal wrapper procedure:

```sql
PROCEDURE write_log(p_msg IN VARCHAR2) IS
  v_file  UTL_FILE.FILE_TYPE;
  v_fname VARCHAR2(50) := 'batch_' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '.log';
BEGIN
  v_file := UTL_FILE.FOPEN('APP_LOGS', v_fname, 'A', 32767);
  UTL_FILE.PUT_LINE(
    v_file,
    TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS.FF3')
    || ' [' || SYS_CONTEXT('USERENV', 'SESSION_USER') || '] '
    || p_msg
  );
  UTL_FILE.FCLOSE(v_file);
EXCEPTION
  WHEN OTHERS THEN
    IF UTL_FILE.IS_OPEN(v_file) THEN
      UTL_FILE.FCLOSE(v_file);
    END IF;
    RAISE;
END;
```

The pattern opens, writes, and closes the file on every call. That is deliberately defensive: if the procedure aborts mid-run, the file is closed rather than corrupted. The cost is filesystem I/O per log line, which matters at high loop speeds but is irrelevant for most batch jobs where log calls are separated by meaningful work.

Where `UTL_FILE` becomes fragile: RAC environments where the Oracle instance can run on different nodes, or any configuration where the server-local filesystem path is not consistently visible. If your Oracle installation does not guarantee a stable server-local path, `UTL_FILE` is fragile by architecture rather than by code quality.

## Pattern 3: Logging tables with autonomous transactions

The pattern that ages best in any Oracle shop is a dedicated log table written via an **autonomous transaction procedure**.

```sql
CREATE TABLE app_log (
  log_id     NUMBER GENERATED ALWAYS AS IDENTITY,
  logged_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  level_cd   VARCHAR2(10),
  module_nm  VARCHAR2(100),
  msg        VARCHAR2(4000),
  session_id NUMBER DEFAULT SYS_CONTEXT('USERENV', 'SESSIONID')
);

CREATE OR REPLACE PROCEDURE log_entry(
  p_level  IN VARCHAR2,
  p_module IN VARCHAR2,
  p_msg    IN VARCHAR2
) IS
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  INSERT INTO app_log (level_cd, module_nm, msg)
  VALUES (p_level, p_module, p_msg);
  COMMIT;
END;
```

`PRAGMA AUTONOMOUS_TRANSACTION` is the critical detail. Without it, the `INSERT` into `APP_LOG` participates in the calling transaction. If that transaction rolls back — say, the batch procedure hits a constraint violation and reraises the exception — your log entries roll back with it. You lose exactly the trace you needed to explain why it failed.

With the autonomous transaction, the log commit is independent. The batch procedure can raise, rollback, and terminate cleanly, and `APP_LOG` retains every entry written up to the failure point. That is the observable behavior that distinguishes this approach from every file-based alternative.

The practical advantage over `UTL_FILE`: log entries are queryable via SQL. You can join them against `V$SESSION`, filter by module, and correlate across parallel sessions. Operations teams can read them without SSH access to an Oracle server host.

Two caveats. First, the autonomous transaction adds one commit per log call. High-frequency logging inside a tight loop — logging every row of a 10-million-row cursor — will saturate your redo logs and slow the batch job measurably. Batch at the level that matters: log when a significant phase boundary is crossed, not when a single row is processed. Second, size and purge `APP_LOG` deliberately. A logging table with no retention policy is a slow disk fill that eventually causes the very failures you were trying to trace.

## Pattern 4: DBMS_APPLICATION_INFO for lightweight session tracing

`DBMS_APPLICATION_INFO` is underused relative to how well it works. It sets attributes on the current session that are immediately visible in `V$SESSION` and `V$SQLAREA` — no tables, no files, no I/O beyond the SGA write.

```sql
DBMS_APPLICATION_INFO.SET_MODULE(
  module_name => 'BATCH_RECONCILE',
  action_name => 'PHASE_2_VALIDATE'
);
DBMS_APPLICATION_INFO.SET_CLIENT_INFO(client_info => 'batch_id=20260928');
```

From a DBA session or a monitoring tool, this is immediately visible:

```sql
SELECT module, action, client_info, status, sql_id
FROM   v$session
WHERE  module = 'BATCH_RECONCILE';
```

The data is live, not deferred. You can watch a long-running batch procedure advance through its phases in real time by polling `V$SESSION`. There is no schema to create, no permissions beyond `EXECUTE ON DBMS_APPLICATION_INFO`, and no cleanup required — the attributes clear when the session ends.

The limitation is equally obvious: nothing persists after the session terminates. `DBMS_APPLICATION_INFO` is for real-time operational visibility, not for after-the-fact forensics. It pairs well with a logging table: use `SET_MODULE` and `SET_ACTION` to surface current phase during execution, and use `LOG_ENTRY` to write a durable record at phase boundaries. The combination gives you live visibility while the batch runs and a queryable history once it finishes.

## Choosing the right tool

Three questions determine the right pattern for a given context:

1. **Does this need to survive session end?** If no, `DBMS_APPLICATION_INFO` is enough. If yes, you need `UTL_FILE` or a logging table.
2. **Does this need to survive a rollback?** If yes, the logging table with `PRAGMA AUTONOMOUS_TRANSACTION` is the only correct answer.
3. **Does this need to be queryable across sessions?** If yes, the logging table wins. `UTL_FILE` requires grep or a custom reader to aggregate across session files.

For most production PL/SQL work in 2026, the right answer is a combination: `DBMS_APPLICATION_INFO` for live phase tracking, and an autonomous-transaction logging table for durable, queryable records. `UTL_FILE` earns its place in environments where a table-based approach adds unwanted schema dependencies — a legacy package you cannot modify, or a scenario where you want a plain-text artefact for an external log pipeline that already handles rotation and archival.

`DBMS_OUTPUT` stays in the IDE where it belongs.

## How Veesker fits into this

Veesker's output panel captures `DBMS_OUTPUT` and renders it inline as you run procedures interactively — that is the right context for it. But when you open a `V$SESSION` query or watch a running job, the `MODULE` and `ACTION` attributes set by `DBMS_APPLICATION_INFO` are displayed directly in the session grid without a manual query.

If you have built an `APP_LOG` table using the autonomous transaction pattern above, Veesker's schema-aware AI knows its structure from your local connection and can help you write queries, filter by severity, and explain correlation patterns in context. It knows the difference between a `TIMESTAMP WITH TIME ZONE` and a `DATE` column, and it will not suggest `LIMIT` where `FETCH FIRST` belongs.

Veesker is local-first by design: none of this requires sending your schema or query history to a remote service. The Community Edition is Apache 2.0, available now for Windows, macOS, and Linux.

If you are auditing or building a PL/SQL logging strategy, [download Veesker](/download) and open your logging tables alongside `V$SESSION` in a single window — you will find things faster than switching between tools.

— *Veesker*
