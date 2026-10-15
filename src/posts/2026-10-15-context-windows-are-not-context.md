---
title: "Context windows are not the same as context"
description: "A 200k token window does not make an AI tool trustworthy for Oracle work. Real context is earned, not measured in tokens."
date: "2026-10-15"
slug: "context-windows-are-not-context"
lang: "en"
kind: "manifesto"
tags: ["ai", "developer-tools", "oracle", "grounding"]
translation_slug: "janelas-de-contexto-nao-sao-contexto"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

The AI tooling market has converged on a single metric for "how good is the context": token count. 128k, 200k, 1M. The implication is that more window means the model knows more about your codebase, your schema, your query history. It does not.

A context window is a container. Context is what you put in it — and more importantly, whether what you put in it is accurate, current, and relevant to the question being asked.

When a developer opens an AI assistant and pastes in a PL/SQL package and asks "why is this slow," the model has no information the developer didn't hand-carry into the prompt. It does not know the execution plan. It does not know whether the statistics are stale. It does not know that the index you think exists was dropped in the 3am maintenance window. It does not know the Oracle version, so it cannot tell you whether the hint you're using was deprecated, or whether the optimizer fix in 19.8 changes the picture.

What the model does know is patterns from its training corpus. For Oracle, that corpus is thin. The open web is full of PostgreSQL, MySQL, and SQLite examples. Oracle questions get answered with general-purpose SQL that happens to parse. The model confidently tells you to use `LIMIT` when Oracle needs `FETCH FIRST`. It rewrites your `CONNECT BY` as a recursive CTE that kills the optimizer. It strips your hints because they "look unusual."

The token window does not fix this. Pasting 200k tokens of Oracle documentation into the prompt does not teach the model how your schema relates to your query. It just makes the model slower and more expensive.

What actually fixes this is grounding. The AI needs to read your real schema — the one the database returned when someone ran `SELECT * FROM ALL_TABLES` five minutes ago, not a months-old ERD you exported for documentation. It needs to know the server version from the connection string, not from your best guess in the prompt. It needs to see the execution plan output, not imagine what the optimizer might have done.

This is why Veesker's AI layer reads directly from the live connection before responding. Schema data comes from the database. Version comes from the connect packet. The EXPLAIN PLAN loop (part of the Cloud layer arriving H2 2026) feeds optimizer output back into the model so suggestions are tested against actual cost estimates, not intuition.

A bigger window is a better notebook. But a notebook is not understanding. The tool that earns your trust query by query is the one that knows what it doesn't know — and goes to look it up rather than hallucinating an answer in 200k tokens of confident prose.

Veesker's Community Edition is free under Apache 2.0. If grounded AI for Oracle work is something your team needs today, [download it](/download). If you're waiting for the managed Cloud layer, [join the waitlist](/#waitlist) — founder pricing locked at $29 USD per seat per month.

— *Veesker*
