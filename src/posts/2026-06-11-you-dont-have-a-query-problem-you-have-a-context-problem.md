---
title: "You don't have a query problem, you have a context problem"
description: "When AI-assisted SQL fails, the model is rarely wrong about SQL — it's wrong about your database. The fix is context, not a bigger model."
date: "2026-06-11"
slug: "you-dont-have-a-query-problem-you-have-a-context-problem"
lang: "en"
kind: "manifesto"
tags: ["oracle", "ai", "sql", "developer-tools", "context"]
translation_slug: "voce-nao-tem-um-problema-de-consulta-tem-um-problema-de-contexto"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

When AI-assisted SQL fails, developers reach for the same explanation: the model doesn't know Oracle well enough. That is almost never the real diagnosis. The model usually knows Oracle. It does not know *your* Oracle.

Consider what a generic LLM sees when you paste a query and ask it to fix performance:

- A query string, stripped of the column names that mean something to your team
- No schema: it does not know whether `TRX_HEADER` has 300 rows or 300 million
- No index information: it cannot know that `IDX_TRX_STATUS_DT` exists and covers exactly the columns it's considering dropping from the WHERE clause
- No version: it will write `FETCH FIRST 10 ROWS ONLY` even if your database is 11g
- No execution plan: it cannot know whether the optimizer chose a nested loop or a hash join — and that choice is usually the actual problem

The model fills those gaps with priors from its training corpus: Stack Overflow answers, Oracle docs pages, blog posts written for 19c and 23ai on clean databases. Your 11g installation with 400 partitioned tables and a statistics gather job that last ran in 2021 is not in that training data.

The result is a suggestion that is *technically correct SQL* and *contextually wrong for your situation*. It looks like a model failure. It is a context failure.

**The fix is not a smarter model. The fix is grounding.**

Grounding means the tool reads your schema before the AI writes a word. It means the tool knows the Oracle version the connection reported, not the version the AI assumes you're running. It means when you ask to optimize a query, the tool attaches the actual `EXPLAIN PLAN` output and lets the model reason from a real execution plan — not an imagined one.

This is the difference between a general-purpose AI assistant that has read Oracle docs and an Oracle IDE that runs AI inside an envelope of real connection data. The former gives you fluent, plausible SQL. The latter gives you SQL that is likely to work on the specific database you are sitting in front of.

Veesker's AI layer is built on this premise. It reads your schema at connection time, attaches the Oracle version, and — through the Cloud layer (coming H2 2026) — closes the loop by feeding `EXPLAIN PLAN` output back into the model after every rewrite suggestion. The AI sees the cost-based optimizer's verdict, not just its own output.

The Community Edition is local-first, Apache 2.0, and runs entirely offline — your schema never leaves your machine. If you want the managed AI loop, that is what the Cloud tier is for: $29 USD per seat per month, founder pricing locked for waitlist members, GA H2 2026.

Stop blaming the model. Give it the context it needs. [Download Veesker](/download) and see what AI-assisted SQL looks like when it actually knows where it is.

— *Veesker*
