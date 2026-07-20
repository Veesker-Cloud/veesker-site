---
title: "Oracle 23ai JSON Relational Duality Views: what they are and how to query them"
description: "JSON Relational Duality Views let you read and write relational data as JSON documents without maintaining a separate document store."
date: "2026-07-20"
slug: "oracle-23ai-json-duality-views"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "23ai", "json", "duality-views", "sql"]
translation_slug: "oracle-23ai-views-dualidade-json"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

The relational-versus-document debate has a twenty-year paper trail. Document databases scale writes with less ceremony. Relational databases enforce referential integrity. Applications shaped like objects want document APIs; compliance and reporting want JOINs. Most teams resolve the tension by running two systems, syncing them, and spending most of their operational energy keeping them consistent.

Oracle 23ai takes a different position: relational storage, JSON surface. JSON Relational Duality Views let you read and write data through a JSON document interface while the underlying representation stays in fully normalized relational tables. One source of truth, two access patterns.

This is not a wrapper that takes a JSON column and slaps some structure on it. It is a first-class DDL object with its own optimistic locking, its own REST lifecycle via ORDS, and its own rules about which parts of the document you own and which you merely reference. This post walks through what a duality view is, how to define one, and what it looks like to query and mutate through it.

## The model: owned vs. linked

A JSON Relational Duality View is built from one or more tables joined in a controlled way. The critical concept is **ownership**. A table in the view is either:

- **Owned**: the view manages its lifecycle. An `INSERT` into the view can create rows in an owned table; a `DELETE` can remove them.
- **Linked** (via `@UNNEST` or `@LINK`): the view reads from the table but does not manage its rows. You can update foreign-key references, but you cannot create or delete the referenced rows through this view.

That distinction is what prevents a duality view from becoming a footgun. You declare ownership explicitly in the DDL, and Oracle enforces it. A `DELETE` on the view only cascades to tables you declared as owned.

## Setting up an example

```sql
CREATE TABLE departments (
    department_id  NUMBER         PRIMARY KEY,
    name           VARCHAR2(100)  NOT NULL
);

CREATE TABLE employees (
    employee_id    NUMBER         PRIMARY KEY,
    name           VARCHAR2(100)  NOT NULL,
    email          VARCHAR2(200),
    department_id  NUMBER
        REFERENCES departments(department_id)
);
```

Nothing unusual — a classic two-table schema. Now the duality view on top:

```sql
CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW employee_dv AS
    employees @INSERT @UPDATE @DELETE
    {
        employeeId   : employee_id,
        name,
        email,
        department   : departments @UNNEST
        {
            departmentId   : department_id,
            departmentName : name
        }
    };
```

The `@INSERT @UPDATE @DELETE` annotations on `employees` declare it as owned. The `@UNNEST` on `departments` links department data inline but does not give this view lifecycle control over department rows. You can move an employee from department 10 to department 20 through this view. You cannot delete department 20 by deleting the employee.

## Reading documents

```sql
SELECT json_serialize(data PRETTY)
FROM   employee_dv
WHERE  data.employeeId = 101;
```

Oracle returns a formatted JSON document:

```json
{
  "employeeId"    : 101,
  "name"          : "Marcus Vinícius",
  "email"         : "marcus@example.com",
  "department"    : {
    "departmentId"   : 10,
    "departmentName" : "Engineering"
  },
  "_metadata" : {
    "etag"  : "8A3F9C2D",
    "asof"  : "0000000001234ABC"
  }
}
```

The `_metadata` object is not optional noise. The `etag` is used for optimistic locking: when you update a document, you pass the etag back, and Oracle rejects the write if the underlying rows changed since you read them. This is the same conflict-detection pattern document stores use, expressed through SQL.

You can also use JSON path syntax in the `WHERE` clause without `json_serialize` if you only need specific fields:

```sql
SELECT data.name, data.department.departmentName
FROM   employee_dv
WHERE  data.employeeId = 101;
```

Oracle handles the JOIN against `departments` and projects the nested field. You do not write the JOIN yourself.

## Inserting through the view

```sql
INSERT INTO employee_dv
VALUES ('{"employeeId": 201, "name": "Ana Beatriz",
          "email": "ana@example.com",
          "department": {"departmentId": 10}}');
```

Oracle parses the JSON, writes to `employees`, and resolves the `department.departmentId` reference to the existing row in `departments`. If you supply a `departmentId` that does not exist, the referential constraint on the underlying `employees` table fires. The relational integrity does not vanish because you used a document API.

## Updating through the view

The canonical pattern for a duality view update is full-document replace: read the document (including its `_metadata.etag`), modify the fields you want, then replace:

```sql
UPDATE employee_dv dv
SET    dv.data = JSON_MERGEPATCH(
           dv.data,
           '{"email": "ana.new@example.com"}'
       )
WHERE  dv.data.employeeId = 201
AND    JSON_VALUE(dv.data, '$._metadata.etag') = '8A3F9C2D';
```

The `etag` check in the `WHERE` clause is the optimistic lock. If another session has modified this employee since you last read it, the etag will not match, the update affects zero rows, and your application knows it needs to reload and retry. No explicit table locks, no serialization penalty for the happy path.

## The ORDS layer

Oracle REST Data Services can expose a duality view as a REST collection automatically. An `ORDS.ENABLE_OBJECT` call on the view produces standard GET / POST / PUT / DELETE endpoints at a URL your application can call without writing any SQL. The REST payload format mirrors the JSON structure you declared in the DDL.

This is what makes duality views relevant for API teams: you define the document shape once, in SQL, and REST, SQL, and JSON path access all honor the same shape. There is no object-relational mapping library in the middle, no event bus keeping a document store in sync, no reconciliation job. The database is the document store, and its normalization is invisible to the consumer.

## What 23ai adds around them

Duality views are a 23c feature that carries forward into 23ai. On 23ai specifically:

- The vector-aware features (`VECTOR_DISTANCE`, embedding columns) in adjacent tables are queryable through the same session. A hybrid schema that combines duality views for document-style entity data with vector columns for embedding search is expressible in one Oracle 23ai instance.
- The `JSON SCHEMA VALIDATE ON` clause on columns feeding a duality view lets you gate writes at the column level before the document API sees them.
- Performance views in `V$SQL` tag duality view operations, so `EXPLAIN PLAN` output still gives you the relational execution plan underneath. You can tune the index layout without changing the document interface.

## How Veesker surfaces this

Veesker reads the connected server's version on handshake. On an 11g connection, the object tree has no duality view category — because the server has no concept of one. On 23ai, the schema browser includes a `JSON Duality Views` node under each schema, alongside tables, views, and procedures.

The AI layer is version-gated the same way: on a 23ai connection, query suggestions can reference duality view syntax; on 19c, they do not. There is no "here are the 23ai features even though you're on 12c" mismatch, because the grounding comes from what the server reported at connection time — not from what Oracle is promoting at peak marketing moment.

Code-assist for duality view DDL — the `@INSERT @UPDATE @DELETE` annotation syntax and the nested table reference format — is one of the cases where a generic LLM trained on the open web produces incorrect output. The syntax did not exist before 23c, and most training corpora reflect that gap. Veesker's schema-aware assistance uses the DDL grammar for the version the connection actually declared.

Veesker is local-first: it reads your schema directly from the connected database, without sending schema structure to any external server. The Community Edition is Apache 2.0 and runs fully offline. The Cloud layer — managed AI, schema-aware auto-tune, and the VeeskerDB Sandbox — is coming H2 2026; join the waitlist now and lock in the $29 USD/seat/month founder price.

## The practical verdict

JSON Relational Duality Views are worth evaluating if you maintain an Oracle 23ai estate and you have application code that shuttles between relational queries and a JSON document layer — especially if that document layer is a manually maintained view, a NoSQL sidecar, or a flat `CLOB` column with custom JSON parsing.

They are not a replacement for Oracle's native JSON column support, which remains the right tool for genuinely schemaless storage. They are a replacement for the glue code that keeps relational data in sync with a document representation. If you already have a well-normalized schema and you need to expose it as a document API, duality views are the path of least damage.

Connect your 23ai instance in Veesker and open the schema browser to see which duality views already exist in your schemas — you may have more than you expect: [veesker.cloud/download](/download).

— *Veesker*
