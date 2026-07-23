---
title: '"Works on Postgres" Is Not Oracle Expertise'
description: "Supporting Oracle is not the same as understanding Oracle. The case for tools built dialect-first, not multi-dialect."
date: "2026-07-16"
slug: "works-on-postgres-is-not-oracle-expertise"
lang: "en"
kind: "manifesto"
tags: ["oracle", "developer-tools", "ai", "sql"]
translation_slug: "funciona-no-postgres-nao-e-expertise-oracle"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

There is a category of developer tool that lists Oracle as one of twenty-two supported databases. The Oracle section of the docs gets its own page. The connection dialog has an Oracle tab. In the marketing copy, Oracle is mentioned next to MySQL, Postgres, SQL Server, and a few others. The tool "supports" Oracle in the same way a French dictionary supports Finnish: it can spell the words, but it has no idea what you mean.

This matters more than it sounds.

Oracle is not Postgres with a different wire protocol. It is a distinct dialect that has been accreting behavior for three decades. `CONNECT BY PRIOR` is not a quirky join — it is the canonical recursive query syntax for a generation of Oracle reports, and it performs differently than a recursive CTE on Oracle's cost-based optimizer. `ROWNUM` predates window functions and behaves in ways that consistently surprise developers who know `LIMIT`. `MERGE` exists in Oracle 9i, predates the SQL standard, and has a slightly different syntax that will silently break if you copy from a Postgres example. Hints — `/*+ INDEX(t t_pk) */`, `/*+ PARALLEL(t 4) */` — are not deprecated noise. They are the vocabulary Oracle DBAs use to communicate with the cost-based optimizer when it makes the wrong call, which happens.

A generic tool either ignores these or gets them wrong. The SQL formatter strips your hints. The AI suggests `LIMIT` instead of `FETCH FIRST N ROWS ONLY`. The schema browser shows a flat table list instead of the CDB/PDB hierarchy that has been the default Oracle shape since 12c. The autocomplete doesn't know what `DBMS_STATS.GATHER_TABLE_STATS` expects because it's reading generic SQL documentation, not Oracle's versioned package signatures.

None of this is malice. It's architecture. When you build for twenty-two databases, Oracle gets a twenty-second share of your attention. That's the math.

The users who pay for that trade-off are the Oracle developers who spend an afternoon hunting a bug that turns out to be their IDE's formatter replacing a working hint with nothing. Or the new team member who gets burned by `ROWNUM` semantics because the tool didn't flag it. Or the DBA who can't trust the AI's rewrite suggestion because it might be Postgres thinking in Oracle clothes.

Dialect-specific tooling is not a niche fetish. It is the minimum bar for a tool that calls itself an Oracle IDE. Knowing the syntax is table stakes. Knowing the optimizer, the package signatures, the version behavior, the wallet handshake, the mixed-estate reality — that is Oracle expertise, and it is not available in a drop-down menu.

Veesker is built Oracle-first — not because Oracle is the only database worth caring about, but because it's the one worth caring about correctly. The Community Edition is free, Apache 2.0, and ships for Windows, macOS, and Linux. No telemetry, no phone-home, no twenty-two-database compromise.

[Download Veesker](/download)

— *Veesker*
