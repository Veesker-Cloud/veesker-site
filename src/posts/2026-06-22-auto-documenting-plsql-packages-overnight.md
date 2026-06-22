---
title: "Auto-documenting 1000 PL/SQL Packages Overnight — Design Notes"
description: "How Veesker's schema-aware pipeline extracts context from the data dictionary, resolves dependencies, and generates reviewable PL/SQL documentation at scale."
date: "2026-06-22"
slug: "auto-documenting-plsql-packages-overnight"
lang: "en"
kind: "deep-dive"
tags: ["oracle", "plsql", "documentation", "ai", "developer-tools"]
translation_slug: "auto-documentando-pacotes-plsql-durante-a-noite"
read_minutes: 7
author: "claude-agent"
hero: "/datamap-hero.png"
---

Most Oracle codebases older than five years share the same documentation story: there is none, or what exists is wrong, or it lives in a Word document that was last opened when Oracle 11g was new. PL/SQL packages accumulate over years of production pressure. A procedure that started as ten lines gains three more parameters, a conditional branch for a special case, two bug fixes with no comment, and a `--TODO` from 2019. The interface drifts. The original developer is gone. The documentation, if it was ever written, is now a liability.

Batch-documenting a thousand-package codebase is not a creative problem — it is an engineering problem. The challenge is not "can the AI write good documentation" but "how do you ground the AI in enough context that the documentation it produces is actually correct." This post covers the design thinking behind Veesker's auto-documentation feature, which is part of the Cloud tier coming in H2 2026.

## The naive approach and why it fails

The naive approach: take each package, dump the source text into a prompt, ask a model for documentation.

This works for toy examples. It falls apart on real Oracle codebases for predictable reasons.

**The AI has no schema context.** A parameter named `p_cust_id NUMBER` could be a primary key, a surrogate key from a legacy sequence, or an external identifier that was renamed three times. Without the actual column definition — its constraint, its foreign key relationship, what it references in `CUSTOMERS` — the AI will guess. The guess will be wrong a meaningful fraction of the time, and when documentation is wrong, it is worse than absent.

**PL/SQL packages routinely reference objects the AI cannot see.** A package body calls `audit_pkg.log_event` and joins across four database links. The signature the AI receives is not the behavior the code actually has. Documenting behavior from the interface alone produces documentation that is locally plausible but globally misleading.

**Large package bodies exceed useful context windows.** A `PACKAGE BODY` with forty procedures, each running 200 lines, is 8,000 lines of PL/SQL. The important structure — which procedures call which, which are public wrappers and which are private implementation — gets compressed into noise at scale.

**Type definitions live in the package spec, but their semantic meaning lives in the database.** A `%ROWTYPE` parameter means something specific. The AI needs to see the actual row definition to document it accurately.

None of these are problems with the AI model. They are problems with context assembly. The fix is not a better model — it is a better pipeline.

## What the pipeline does instead

The documentation pipeline starts before the AI touches a character of PL/SQL. It runs in three phases: schema extraction, dependency resolution, and batched generation.

**Schema extraction** reads the data dictionary first: `ALL_ARGUMENTS`, `ALL_PROCEDURES`, `ALL_OBJECTS`, `ALL_DEPENDENCIES`, `ALL_TYPES`, `ALL_TAB_COLUMNS`. For each package, it assembles a structured representation of the package interface — procedure names, parameter names, parameter directions, data types resolved to their base type (no `%TYPE` aliases that require another lookup), and any documented constraints in `ALL_COL_COMMENTS`. This representation is compact. A package with twenty procedures becomes a few hundred tokens, not thousands of lines of source.

**Dependency resolution** traces one level of outbound calls: which other packages does this one call? Which tables does it read and write? This is not full transitive resolution — that path leads to O(n²) work on large codebases — but one level is usually enough to answer the question "what does this package actually touch." The dependency graph shapes the documentation: a package that only reads is documented differently from one that owns writes, deletes, and external calls.

**Batched generation** groups packages by size and complexity, then sends structured prompts to the model with the extracted context attached. The prompt is not "here is the source code, write documentation." It is "here is the interface, here are the resolved parameter types, here is what this package calls, here is what data it reads — write documentation for a senior Oracle developer who will use this to understand the codebase without reading every body." That constraint — "senior developer, codebase understanding" — is meaningful. It discourages the AI from padding with obvious observations and pushes it toward the non-obvious ones.

The output format is `COMMENT ON PROCEDURE` and `COMMENT ON FUNCTION` DDL statements, plus a package-level header. They can be reviewed as a diff, applied to the target schema, and picked up by `ALL_PROCEDURES` and standard Oracle documentation extractors.

## What makes PL/SQL documentation different

PL/SQL documentation is not like documenting a Python function. A few things that matter.

**Exception behavior is load-bearing documentation.** A procedure that raises `NO_DATA_FOUND` under specific conditions and handles it internally is fundamentally different from one that lets it propagate. Callers need to know which. This is not visible in the signature and is genuinely hard to infer from the source alone. The pipeline flags procedures with `EXCEPTION WHEN OTHERS THEN NULL` — a common silent error-swallowing pattern — and notes them explicitly in the generated documentation.

**Cursor output is the real interface for reporting packages.** Many legacy Oracle packages have procedures that open a `SYS_REFCURSOR` and return a result set. Documentation for these procedures is only useful if it describes what columns the cursor returns. That is not in the spec. The pipeline reads the `SELECT` statement from the body (where accessible) and describes the projection explicitly.

**Overloaded procedures require disambiguation.** Oracle allows procedure overloading within a package. A package can have three `GET_ACCOUNT` procedures with different parameter lists. The documentation engine handles each overload separately and includes the parameter signature in the documentation header to make disambiguation unambiguous.

## The overnight part

The "1000 packages overnight" framing is not metaphorical. With the Cloud tier's batched approach, a schema with a thousand packages processes in a few hours at off-peak API costs. The overnight scheduling is deliberate — schema-aware documentation generation involves a significant number of database reads and API calls. Keeping it as a background job avoids disrupting the development day.

The pipeline respects rate limits at both ends: Oracle connection pooling on the database side, configurable concurrency on the API side. Larger schemas can be broken into daily incremental runs — documenting the packages that changed since the last run rather than the full catalog every time.

## The review step

The design does not assume generated documentation is correct. The workflow is:

1. Generate the full documentation batch overnight.
2. Surface a review interface showing each generated doc alongside the original source.
3. Allow the team to approve, edit, or reject per-package, with the approved set applied as a DDL migration.

The review interface matters more than the generation step. Documentation that cannot be reviewed will not be trusted. Documentation that cannot be edited will not be kept current. The Cloud workflow is built around the assumption that the AI produces a first draft, not a final answer. The team owns the output.

This is consistent with how Veesker approaches AI features generally. The model is grounded in your schema, your Oracle version, your data dictionary — it does not hallucinate table names or invent parameter semantics. But it is still inference, not certainty. Human review before commit is the correct architecture.

## Local-first, Cloud-optional

The schema extraction and dependency resolution components are built on the same data dictionary reading that powers the existing schema browser in the Community Edition. That layer runs locally, against your own Oracle connection, and never sends schema metadata anywhere without your opt-in. The batched generation pipeline and the review interface are Cloud features — they require the managed service to coordinate the API calls and store the review state.

The Community Edition today gives you the schema browser, the SQL editor, PL/SQL execution, and the local AI layer grounded in your schema. The auto-documentation feature extends that with a Cloud-coordinated pipeline for scale. Same local-first posture, same security model — the Cloud is an optional layer, not a prerequisite.

---

If you are managing a large PL/SQL codebase and documentation debt is slowing down onboarding or incident response, this is the problem Veesker Cloud is designed for.

**[Join the Cloud waitlist](/#waitlist)** — founder pricing locked at $29 USD per seat per month for waitlist members. GA H2 2026.

— *Veesker*
