---
title: "Context windows are not the same as context"
description: "A 200k-token window doesn't tell an AI anything about your 11g database. Context has to be earned, not just measured in tokens."
date: "2026-10-01"
slug: "context-windows-are-not-context"
lang: "en"
kind: "manifesto"
tags: ["ai", "oracle", "developer-tools", "trust"]
translation_slug: "janelas-de-contexto-nao-sao-contexto"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

Every AI tool in the database space leads with the same number: context window size. 200k tokens. 1M tokens. "Your entire codebase fits in context."

The window size is real. The claim that it solves your problem is not.

A context window is a container. Context is what goes inside it. Every Oracle developer who has watched a large-context LLM confidently produce `LIMIT 10` for a 19c query, or suggest a `WITH` clause that won't compile on 11g, already knows the difference.

What a 200k-token window gives you is the ability to paste in more source code. What it does not give you automatically:

- Knowledge of which Oracle version the connection is actually running
- Understanding of which built-in packages are available in that version
- Awareness of the indexes, constraints, and statistics that govern the query plan
- Version-specific semantics of `MERGE`, `CONNECT BY`, and the PL/SQL built-ins that changed across Oracle releases

None of that travels in a context window unless something deliberately puts it there. The model doesn't read your `v$version` output before it answers. It doesn't check whether `JSON_OBJECT` existed in 12c. It doesn't know that `DBMS_STATS` expects different parameters on 11g than on 19c.

This is the trust gap that matters. Not whether the model is smart enough to write SQL — it is. The gap is whether the tool did the work to give the model what it actually needs to answer correctly.

Grounding is not a feature. It is the precondition for AI database tooling you can trust in production.

Veesker reads the connected server version at login and carries it into every prompt. It reads your schema locally — no upload, no cloud dependency, no leaking table names to a third-party API — and includes the live structure of the objects you're querying. When you ask for a rewrite on an 11g connection, the model knows it is 11g. When you ask about 23ai vector search, the model knows which functions actually exist.

The context window is just the budget. What matters is whether the tool spent that budget on things that are true.

Trust in AI tooling is not a one-time decision. It is built one query at a time — every time the suggestion lands correctly, every time it doesn't hallucinate a function that doesn't exist in your version, every time it respects the index hint you wrote because you had a reason for it.

A large context window is easy to ship. Earned context is the work.

**Download Veesker** and connect to your Oracle environment with AI that knows exactly what version it is talking to: [veesker.cloud/download](/download).

— *Veesker*
