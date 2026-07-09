---
title: "Why \"Works on Postgres\" is not Oracle expertise"
description: "Generic SQL tools that advertise Oracle support usually mean connection, not comprehension — and the difference matters every time you write PL/SQL."
date: "2026-07-09"
slug: "works-on-postgres-is-not-oracle-expertise"
lang: "en"
kind: "manifesto"
tags: ["oracle", "developer-tools", "plsql", "ai"]
translation_slug: "funciona-no-postgres-nao-e-expertise-oracle"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

The Oracle support page on most database tools means one thing: the tool can open a connection. It found a JDBC driver. It rendered a table list. That is not Oracle expertise. That is Oracle connectivity.

The distinction matters because Oracle is not a syntax variant of Postgres or MySQL. It is a separate engineering lineage — one that has been accumulating its own decisions since before most of its current users were born. CONNECT BY, not recursive CTEs. MERGE with an ON clause that follows different parsing rules than SQL Server. ROWNUM semantics that break immediately if you wrap them in the wrong subquery. Exception handlers in anonymous blocks. Package-level state that persists across calls in the same session. Autonomous transactions. Hierarchical queries. Type inheritance in object-relational schemas. Twenty-plus years of hint syntax that the optimizer still reads.

A generic tool does not know any of this. It renders rows. It runs EXPLAIN PLAN if you're lucky. When you ask it to help you write a PL/SQL procedure, it writes something that looks plausible and breaks on compile. When its AI suggests a query rewrite, it quietly emits `LIMIT 10` instead of `FETCH FIRST 10 ROWS ONLY`, and hopes you are not paying attention.

The same problem hits AI harder. An LLM trained on the open web has seen vastly more Postgres queries than Oracle ones, vastly more Stack Overflow answers about MySQL than PL/SQL packages. When you ask it to help with an Oracle problem, it will often answer the Postgres version of that problem, with just enough surface resemblance to fool you into pasting it.

Dialect-specific expertise is not a marketing position. It is a set of decisions made at every layer of the product: the parser that knows `CONNECT BY NOCYCLE PRIOR` is valid Oracle syntax; the AI context that includes the connected server version before every prompt; the UI that shows CDB and PDB structure on 12c and hides it on 11g; the autocomplete that does not suggest JSON functions that did not exist until 21c.

You can build a tool that works on Oracle, Postgres, MySQL, SQL Server, and twelve others. The question is what "works" means. If it means opens a connection, plenty of tools clear that bar. If it means the tool actually understands what you are writing when you write Oracle — that the suggestions are correct, the parser is right, the AI is grounded — then dialect specialization is not optional. It is the product.

Veesker is Oracle-first by design. The Community Edition is free under Apache 2.0, ships for Windows, macOS, and Linux, and connects to every Oracle version from 9i through 26ai without a separate client install. Download it at [veesker.cloud/download](/download), or [join the Cloud waitlist](/#waitlist) — managed AI, auto-tune, and team workflows arriving H2 2026, founder pricing locked at $29 USD per seat per month for waitlist members.

— *Veesker*
