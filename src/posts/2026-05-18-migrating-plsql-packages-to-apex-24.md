---
title: "Migrating legacy PL/SQL packages to APEX 24.x — a field guide"
description: "A practical approach to surfacing legacy PL/SQL business logic through APEX 24.x: what to lift as-is, what to rewrite, and where AI helps and where it doesn't."
date: "2026-05-18"
slug: "migrating-plsql-packages-to-apex-24"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "apex", "migration", "developer-tools"]
translation_slug: "migrando-pacotes-plsql-para-apex-24"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Most Oracle estates have a common shape: a core of PL/SQL packages written between ten and twenty years ago, carrying validated business logic that nobody wants to risk rewriting wholesale. Order calculation engines. Tax computation routines. Inventory allocation logic. The packages work. They pass audits. They are also completely invisible to anything outside the Oracle session that calls them.

APEX 24.x does not ask you to abandon that logic. It asks you to surface it — carefully, with clear boundaries between what stays in PL/SQL and what moves to the new layer. That is a fundamentally different ask than a migration to a Java microservice or a Python rewrite. The database remains the system of record and the compute layer. APEX becomes the surface.

## What APEX 24.x adds to the migration toolkit

Three capabilities in the 24.x line materially change the migration calculus.

**ORDS automatic REST enablement for PL/SQL.** Oracle REST Data Services, which ships with APEX 24.x, can auto-REST-enable stored procedures and functions. A package procedure that takes a customer ID and returns a JSON result set can be exposed as a GET endpoint in minutes, not days. The result is not production-ready by default — you still need to control which parameters are exposed, add authentication, and handle error propagation — but it gives you a fast path to test a procedure through HTTP before building APEX pages around it.

**APEX_EXEC for in-page PL/SQL invocation.** The `APEX_EXEC` API lets you call a PL/SQL stored procedure from an APEX process without writing a custom AJAX wrapper. For procedures that need session context — current user, application language, item values — `APEX_EXEC` handles the plumbing. The migration pattern is: keep the package procedure as-is, add a thin APEX process that calls it via `APEX_EXEC`, pass item values as bind parameters. The original code is untouched. The original test suite still runs against it.

**Structured error surfacing in the Page Designer.** APEX 24.x improved the display of unhandled PL/SQL exceptions at the page level. An older migration approach would swallow exceptions inside a generic error handler and return a blank HTTP 500. The newer error-handling hooks give you a structured way to translate `ORA-xxxxx` codes into user-facing messages without instrumenting every caller.

## Four migration patterns

### 1. Procedure-as-process (no new SQL needed)

The simplest case. You have a package procedure that does work and has no return value — it writes to a log table, sends a notification, updates a status column.

```sql
-- Existing package procedure, untouched
PROCEDURE mark_order_complete(p_order_id IN NUMBER) IS
BEGIN
  UPDATE orders SET status = 'COMPLETE', completed_at = SYSDATE
  WHERE order_id = p_order_id;
  order_audit.log('COMPLETE', p_order_id,
                  SYS_CONTEXT('USERENV', 'SESSION_USER'));
  COMMIT;
END;
```

In APEX, create a Page Process of type "PL/SQL Code" on the relevant page. The body is a single call:

```plsql
order_pkg.mark_order_complete(p_order_id => :P10_ORDER_ID);
```

`:P10_ORDER_ID` is a page item. APEX binds it before execution. The original procedure is untouched. No ORDS required. This pattern covers a large fraction of "action" procedures in most packages.

### 2. Function-as-computation (result into a page item)

A package function returns a scalar value — a computed price, a formatted string, a status code. You want that value to populate a page item.

```plsql
-- In a Before Header process or a Dynamic Action:
:P10_COMPUTED_PRICE := pricing_pkg.calculate_price(
  p_product_id  => :P10_PRODUCT_ID,
  p_quantity    => :P10_QUANTITY,
  p_customer_id => :P10_CUSTOMER_ID
);
```

Bind parameters in, bind variable out. No wrapper function. No DDL change. The pricing package does not know APEX exists.

### 3. REF CURSOR procedures surfaced through APEX_EXEC

Procedures that return a `SYS_REFCURSOR` are common in older packages — they predate SQL query regions and were designed to feed reporting screens. `APEX_EXEC` can open and iterate a cursor:

```plsql
DECLARE
  l_context APEX_EXEC.t_context;
BEGIN
  l_context := APEX_EXEC.open_cursor(
    p_sql             => 'BEGIN order_pkg.get_orders_for_customer'
                      || '(:p_cust_id, :p_cursor); END;',
    p_auto_bind_items => true
  );
  -- APEX renders the result set through the context handle
  APEX_EXEC.close(l_context);
END;
```

This works for Classic Report and Interactive Grid sources where the original procedure returns exactly the columns the region needs. Where the columns don't match, you face a genuine refactor — the cursor signature needs to change, which means the package spec changes. That is the line where "surface it" becomes "rewrite it."

### 4. Autonomous transaction blocks

A subtle failure mode: package procedures that declare `PRAGMA AUTONOMOUS_TRANSACTION` for audit logging can deadlock or leave dangling sessions when called inside an APEX transaction that has not committed. The fix is not to remove the autonomous transaction — it exists for a reason — but to structure the APEX page so the outer transaction commits or rolls back before the audit procedure fires. Process sequencing in the APEX Page Designer controls this. The order of Before Submit and After Submit processes matters more than most developers expect when autonomous transactions are in play.

## Where AI helps — and where it doesn't

AI-assisted migration of PL/SQL packages is genuinely useful in narrow ways and genuinely dangerous in others.

**Useful: generating APEX process stubs.** Given a package spec, a schema-aware model can produce the correct `APEX_EXEC` call, the right bind parameter names, and a draft error-handling block. Work that took twenty minutes of copy-paste and manual parameter matching takes under two minutes.

**Useful: auditing global package state.** Many older packages use package-level variables as a form of session state — `pkg.g_current_user`, `pkg.g_run_mode`. Those variables reset on session reconnect and carry no meaning in APEX's stateless page-request model. A model that can read the full package body can flag every reference to a package global and estimate the refactor scope before you commit to it.

**Dangerous: letting the model rewrite PL/SQL business logic without human review.** The model does not know your data. It does not know what `order_audit.log` actually commits to, whether `SYSDATE` here is adjusted for a timezone offset downstream, or whether `pricing_pkg` has a dependency on a database link that won't exist in the APEX context. Surface-level changes — stubs, binding wrappers, error handlers — are safe to automate. Logic changes require a human who understands the domain.

Veesker's schema-aware AI reads your package specs and bodies locally — it does not send them to a remote service by default. You get stub generation and global-state auditing without the schema leaving the building. The Cloud layer (coming H2 2026) adds a feedback loop: `EXPLAIN PLAN` output fed back into the model so rewrites are measured against the optimizer's verdict, not a heuristic.

## Staging the work

A practical sequence for a realistic package migration project:

**Inventory first.** Count package procedures and functions. Classify each as action (no return value), computation (scalar return), or data (cursor return). The distribution tells you how much ORDS you need versus how much is pure APEX process work.

**Freeze the package specs.** Once you start wiring APEX against a package, the spec is a public API. Changing the parameter list of a procedure means updating every APEX process that calls it. Fix the signatures before you start wiring.

**Wire read paths before write paths.** Report regions and Display Only items carry lower risk than processes that UPDATE or DELETE. Build confidence in the call patterns before you expose mutation.

**Run the original test suite at every step.** The packages themselves have not changed; their existing tests should still pass. If they don't, the wiring introduced a side effect — and you want to know that before the APEX page ships.

**Defer the hard cases deliberately.** Autonomous transactions, cross-session package state, database links, external procedure calls — these are real engineering problems that deserve dedicated sprints, not late-night hotfixes. Name them explicitly in your backlog. "We are not migrating `external_pkg` in this phase" is a valid and honest project decision.

The field guide principle is the same as any migration: reduce what you rewrite, surface what already works, and be honest about the complexity you are deferring.

---

Download Veesker to browse your package inventory, trace call dependencies, and get schema-aware AI assistance for PL/SQL — locally, without your schema leaving the building: [veesker.cloud/download](/download).

— *Veesker*
