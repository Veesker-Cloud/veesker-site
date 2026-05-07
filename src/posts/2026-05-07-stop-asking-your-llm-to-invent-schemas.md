---
title: "Stop asking your LLM to invent schemas. Ground it."
description: "A grounded model writing against your real schema beats a frontier model guessing. The bottleneck for AI on databases is context, not intelligence."
date: "2026-05-07"
slug: "stop-asking-your-llm-to-invent-schemas"
lang: "en"
kind: "manifesto"
tags: ["ai", "oracle", "schema", "context"]
translation_slug: "pare-de-pedir-pro-llm-inventar-schemas"
read_minutes: 3
author: "claude-agent"
hero: "/blog/stop-asking-your-llm-to-invent-schemas.png"
---

There is a workflow that has quietly normalized in 2026, and it is broken.

A developer opens ChatGPT, pastes "I have a customers table and an orders table, write me a query that finds top spenders this quarter", and ships whatever falls out. The model invents column names. The developer fixes them by hand. The query runs. Everyone calls this "AI-assisted SQL".

It is not. It is the model auto-completing a Stack Overflow answer from 2017, with your column names sprayed on top.

The same prompt against the *actual* schema — `CUSTOMERS.CUST_ID`, `ORDERS.ORDER_DATE`, the foreign key direction, the fact that there is a partition on `ORDER_DATE` and the optimizer wants the predicate written a specific way to use it — produces a different query. A correct one. Often a 30× faster one. The difference is not the model. The difference is what the model can see.

This is the entire game. **Grounded beats frontier.** A 70B parameter model writing against a real schema, real data types, real indexes, and real Oracle version metadata will out-perform a 400B parameter model guessing in the dark. We have measured this. So has anyone who has tried both honestly.

Yet the entire AI-for-databases category is built on the opposite assumption. Connect to a SaaS, paste a question, get an answer that looks plausible. The schema, if it shows up at all, is whatever a sidebar inferred from a `SHOW TABLES` two prompts ago. The Oracle version is "Oracle, probably". The hints in your existing query are stripped out because the model thinks they are deprecated. They are not.

This is why our local-first stance is not nostalgia, and not a security checkbox. It is the only architecture that can put real schema in the prompt without first uploading your database to a third party. The IDE reads the data dictionary. It knows what version it is talking to. It sees the partitioning, the constraints, the indexes, the column comments your DBA wrote in 2019 and forgot. It feeds *that* into the model. The model writes a query that respects all of it.

The Cloud layer (coming H2 2026) extends the loop, not the lookup: `EXPLAIN PLAN` output goes back into the model, and the next suggestion is measured against the cost-based optimizer's verdict — not a heuristic.

If you are still pasting schemas into a chat box by hand, you are doing the model's job for it. Stop. Pick a tool that reads your schema for you, locally, and feeds it to the model in full. The query you get back will not be plausible. It will be correct.

[Download Veesker](/download). Apache 2.0, Windows / macOS / Linux, 9i through 26ai out of the box.

— *Veesker*
