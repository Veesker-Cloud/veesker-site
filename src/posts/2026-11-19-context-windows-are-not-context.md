---
title: "Context windows are not context"
description: "A bigger token bucket does not make AI-generated SQL better. Real context is earned through grounding — schema, version, constraints — not volume."
date: "2026-11-19"
slug: "context-windows-are-not-context"
lang: "en"
kind: "manifesto"
tags: ["ai", "sql", "oracle", "developer-tools", "grounding"]
translation_slug: "janelas-de-contexto-nao-sao-contexto"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

The marketing pitch for every AI-enhanced developer tool in 2026 converges on the same claim: "our context window is larger." 200k tokens. 500k tokens. The whole codebase. The whole schema. Everything in one shot.

This is the wrong metric, and treating it as the right one has real costs for Oracle developers.

A context window is a capacity. Context is a signal. They are not the same thing.

Shoving your entire schema dictionary — hundreds of tables, thousands of columns, every PL/SQL package signature — into a prompt does not give the model better context. It gives the model more noise to reason over. The Oracle optimizer has a name for this failure mode: bad cardinality estimates from too little structure, not too much data. The same thing happens to language models.

The queries that go wrong are not the ones where the model had too little to read. They are the ones where the model had no reliable signal about *what mattered*. What is the target Oracle version? What is the data type of this column in this release? What hints is this DBA trying to preserve? What is the realistic row count the optimizer cares about?

None of those questions are answered by dumping 500k tokens of schema DDL into a prompt. They are answered by grounding — by building a system that understands the specific database it is talking to, the specific Oracle version it is generating for, and the specific constraints the developer has already established.

Trust in AI-generated SQL is earned one query at a time, by being right in ways the developer can verify. That means the first query the tool generates is not drawn from a generic "Oracle is like this" belief, but from the actual server version in the connection, the actual columns in the referenced tables, the actual execution plan the optimizer would produce.

A context window that is 500k tokens wide does not build that trust. A tool that reads the connection, reads the schema, reads the plan, and generates SQL that is correct *for this database today* does.

Veesker's AI layer is local-first because that is the only way to earn that signal without the data leaving the building. The schema is read on demand from the live connection. The Oracle version is embedded in every prompt. The grounding happens before the generation, not instead of it.

Bigger is not better. Accurate is better. When Cloud AI lands in H2 2026, it will carry the same discipline: the managed layer feeds `EXPLAIN PLAN` output back into the model, so every suggestion is measured against the optimizer's actual verdict. Not a heuristic. Not a guess from the training corpus. The plan.

If you are evaluating AI tools for Oracle work, do not ask how large the context window is. Ask whether the tool knows your Oracle version without you telling it. Ask whether it reads your actual schema rather than a generic superset. Ask whether it can show you the execution plan behind the suggestion. Those are the questions that separate a tool that earns trust from one that just has a bigger bucket.

[Download Veesker](/download) and try a grounded query against your own schema.

— *Veesker*
