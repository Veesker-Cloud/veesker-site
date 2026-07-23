---
title: "Dead software and open licenses: what you owe the people who built workflows on your tool"
description: "When a developer tool dies, an open license is not charity — it is the minimum you owe every developer who built workflows on your promise of longevity."
date: "2026-07-23"
slug: "dead-software-open-licenses"
lang: "en"
kind: "manifesto"
tags: ["open-source", "developer-tools", "licensing", "sustainability"]
translation_slug: "software-morto-licencas-abertas"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

There is a specific cruelty in the death of a closed developer tool.

Not cruelty in the sharp sense — no one intended harm — but in the structural sense. You built your export pipeline on it. You wrote two thousand lines of macros that invoke its API. You trained your junior developer on its shortcuts. And then the company behind it pivoted, got acquired, or simply stopped shipping. The tool rotted. The license server went dark. The vendor's website stayed up for eighteen months until someone forgot to renew the domain.

And you were left holding workflows that no longer work, in a format nobody can read.

This is not rare. It is the default outcome for closed developer tools. Most of them die. Most of them die without giving you anything on the way out.

## What you actually owe

If you ship a developer tool and you ever intend to stop supporting it — which, eventually, every vendor does — you owe your users source access under an open license. That is it. Not a migration guide. Not a hosted export service. Not a blog post explaining the pivot. **Source code, Apache 2.0 or equivalent, where they can fork, maintain, and adapt.**

An open license is not charity. It is the only honest acknowledgment that your users built real things on top of your software, and that their investment in your tool outlasts your willingness to maintain it.

A closed license, when the product dies, is a silent transfer of risk. You took the subscription revenue. You kept the source. And when you left, you left them with nothing they can fix.

## The Oracle DBA's version of this problem

Oracle tooling is littered with exactly this pattern. Tools that dominated the category in 2008 and still run on machines today because migration is too expensive. Macros written in proprietary scripting languages with no public spec. Connection profiles in formats that only one binary can read.

If that binary stops running on a current OS, the options are: find an old machine, run a VM, or rewrite from scratch. Thousands of person-hours of accumulated automation, and the only path forward is reconstruction.

This is what "trusted your tool with our workflows" actually means in practice. Not an abstract relationship with a vendor. Real macros. Real templates. Real training artifacts. Real cost.

## The responsible exit

The answer is straightforward. If you build a developer tool — especially one that accumulates user-authored configurations, scripts, or workflows — design your license with the exit in mind. Apache 2.0 means that when you stop caring about the code, someone else can. MIT means the same. AGPL means the same, with different tradeoffs.

"We might open-source it if the community grows" is not a plan. It is a deferral that never resolves, because the community cannot grow without the confidence that the deferral ends.

Veesker ships the Community Edition under Apache 2.0 from day one. Not because it guarantees the company succeeds — no license does that — but because the people who build Oracle workflows on Veesker deserve to be able to read, modify, and fork the tool they depend on. If Veesker ever stops being maintained, the code is already there. That is the deal.

Every developer tool vendor should make it explicitly. Most do not. They should.

---

If you maintain Oracle automation that you cannot afford to lose to a vendor pivot, download Veesker: [veesker.cloud/download](/download).

— *Veesker*
