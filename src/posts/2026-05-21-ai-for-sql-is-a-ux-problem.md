---
title: "Why \"AI for SQL\" is mostly a UX problem, not a model problem"
description: "The LLM can write correct Oracle SQL — it just needs the schema, the version, and the execution plan. Giving it those three things is a UX job, not a model job."
date: "2026-05-21"
slug: "ai-for-sql-is-a-ux-problem"
lang: "en"
kind: "manifesto"
tags: ["oracle", "ai", "developer-tools", "ux"]
translation_slug: "ia-para-sql-e-um-problema-de-ux"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

The headline story about AI and SQL has been wrong for two years. The debate is about whether the model is good enough. The real bottleneck is whether the tool is doing its job.

Most "AI for SQL" products follow the same pattern: paste a schema into a system prompt, wrap a chat interface around a frontier LLM, and ship. The model is state-of-the-art. The UX is a box with a blinking cursor. And when the model hallucinates `LIMIT 10` instead of `FETCH FIRST 10 ROWS ONLY`, or suggests a `MERGE` that only parses on Oracle 23ai, or strips out your carefully placed hints because it decided they were noise — the product team blames the model.

The model is not the problem.

The model has never seen your Oracle version. It doesn't know whether you're on 11g with a restricted built-in package set or on 23ai with vector columns in scope. It can't read your `EXPLAIN PLAN` output. It has no signal on whether a proposed rewrite improved things or made them worse. You gave it a prompt, it gave you a guess, and everyone acts surprised when the guess is wrong.

This is a context problem. Context is a UX responsibility.

The fix is not a bigger model. The fix is wiring the tool so the model knows three things before it writes a single token: the schema of the tables in scope, the Oracle version of the connected database, and — if you're asking for a rewrite — the execution plan of what you're starting from. Give the model those three inputs and the error rate drops to a fraction of what a bare chat interface produces. Give it none of them and even a frontier model will generate SQL that fails a parse check before it reaches the optimizer.

Veesker's AI layer is built around exactly this. Schema context is pulled from the live connection and included automatically. Server version is read from the connect packet and injected into every request, so the model never suggests syntax that doesn't exist on your Oracle. The Cloud layer (coming H2 2026) closes the loop with execution plan feedback — a rewrite is measured against the optimizer's verdict before it's offered as a suggestion.

That's not a model advancement. It's a UX decision made before the model is ever invoked.

The debate in the industry should shift. Stop asking which model to trust with Oracle SQL. Start asking whether your tool is doing the work of grounding the model before it answers. A well-grounded, smaller model beats an ungrounded frontier model on domain-specific SQL. Not because the smaller model knows more — because it was given something concrete to work with.

Veesker is local-first by design; the desktop app reads your schema directly without phoning home. The Community Edition is free under Apache 2.0. If you want to see what grounded AI assistance for Oracle looks like in practice, [download Veesker](/download) and point it at your 11g, 19c, or 23ai schema.

The model doesn't change. The context does.

— *Veesker*
