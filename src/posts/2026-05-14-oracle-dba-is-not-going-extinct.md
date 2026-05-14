---
title: "The Oracle DBA is not going extinct"
description: "The Oracle DBA is not going extinct — the problem was never the expertise, it was the tooling that failed to match it."
date: "2026-05-14"
slug: "oracle-dba-is-not-going-extinct"
lang: "en"
kind: "manifesto"
tags: ["oracle", "dba", "ai", "developer-tools"]
translation_slug: "o-dba-oracle-nao-esta-desaparecendo"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

The tech press has been burying the Oracle DBA since at least 2012. NoSQL was going to make schema expertise obsolete. The cloud was going to automate the operational work away. Now AI is getting its turn at the prediction.

The Oracle DBA is still here.

Not because the technology hasn't changed — it has. But because the thing DBAs actually do has never been about writing `SELECT` statements. It's about understanding a system under load: why the optimizer is making a bad join decision, why a PL/SQL package that ran cleanly in 11g is crawling in 19c after a stats refresh, why the weekend batch job is fighting the Monday OLTP load for buffer cache. That knowledge takes years to build against a specific estate and cannot be automated away by a model that has never seen your schema.

What AI changes is the cost of routine work. Generating the boilerplate `MERGE`. Explaining an unfamiliar package inherited from a predecessor. Writing the first draft of a performance report. These have always consumed hours that experienced DBAs would rather spend elsewhere. A model that handles them competently is not a replacement — it's a blocker removed.

The problem was never the DBA. It's been the tools.

SQL Developer is still a Java application with an interface from 2008. Toad carries years of design debt and is closed-source in ways that matter when you need to audit the tool itself. DBeaver is genuinely good but treats Oracle as one of fifty-plus supported dialects — Oracle-specific features get what attention is left over. Virtually nothing available has been built from scratch with AI as a first-class concern. Most of it has AI bolted on: a right-click menu item, a tab that opens a generic chat window with no schema context.

Veesker is built for the DBA who knows their Oracle estate and wants a tool that matches that depth. One that knows the difference between 11g and 23ai without being told, because it read the server version at connection time. That keeps credentials in the OS keychain, not a config file. That grounds AI context in your actual schema, not a hallucinated approximation of it. That runs locally by default, because your compliance team has opinions about where connection strings travel.

The Cloud layer — coming H2 2026 — closes the AI feedback loop: `EXPLAIN PLAN` output fed back into the model so that suggested rewrites are validated against the cost-based optimizer before you see them. Not a guess. Evidence.

The DBA who knows their Oracle estate deeply is not a relic. They're the person who will get the most out of tools like this. The goal was never to replace that expertise — it was to stop wasting it.

**[Download Veesker](/download)** — Community Edition, Apache 2.0, no telemetry. If you run an Oracle team and want the managed Cloud layer: **[join the waitlist](/#waitlist)**. Founder pricing locked at $29 USD per seat per month.

— *Veesker*
