---
title: "Context windows are not context: why AI tools need to earn trust one query at a time"
description: "A large context window is capacity, not understanding. Real context for an AI database tool means knowing the right facts — schema, version, plan — not ingesting everything and hoping."
date: "2026-09-17"
slug: "context-windows-are-not-context"
lang: "en"
kind: "manifesto"
tags: ["ai", "developer-tools", "oracle", "grounding"]
translation_slug: "janelas-de-contexto-nao-sao-contexto"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

The marketing around AI for developer tools has converged on one metric: context window size. 100k tokens. 200k. 1M. The implication is that bigger is better — that an AI with access to more text is inherently more useful, and that the right answer to "why does this AI give me wrong Oracle queries?" is "it needs to see more of your codebase."

That is not accurate, and it is costing developers time they do not have.

A large context window is not context. It is capacity. What you fill that capacity with — and whether the model can reliably retrieve the right signal from it — determines whether the AI is useful or dangerous.

## The failure mode Oracle developers know

Drop a generic AI with a 200k-token context into an Oracle environment. Feed it your schema DDL. Ask it to optimize a query.

It will read the schema. It will write SQL. It will look plausible. And it will probably ignore the index that matters because it was documented in a comment buried in a 40k-token DDL file. It will choose syntax that parses correctly on 19c but behaves differently on 11g. It will suggest a rewrite that ignores the CBO plan you have been managing for three years.

None of these are context-window failures. They are grounding failures. The model does not know what it does not know: which index is hot, which execution plan is intentional, which version-specific behavior you depend on. A larger context window does not fix that. It just gives the model more text to appear confident while getting it wrong.

## What earned context looks like

Earned context is purpose-built and precise. It is not "we fed the model your entire repository." It is:

- The schema browser that reads what is actually in your live database, not what the DDL files claim should be there
- The version string from the connect handshake, so the AI knows which syntax is valid and which will fail on your server
- The `EXPLAIN PLAN` output that grounds a proposed rewrite in the optimizer's actual verdict, not a prior
- The connection tag that says read-only — which the AI respects because the tool enforces it, not because it was asked nicely

Narrow, deliberate, grounded in live state. That is the architecture that makes an AI tool trustworthy in a production Oracle environment.

Trust is not established in a demo. It is established query by query, in the cases where the tool says "this will not work on your version" instead of generating something that compiles and misbehaves. That credibility comes from knowing the right things, not from reading everything.

Context windows are a cost. Context is a discipline.

---

Veesker's AI layer grounds every suggestion in your live schema, Oracle version, and execution plan. Try it on your own database: [veesker.cloud/download](/download).

— *Veesker*
