---
title: "Why 'Works on Postgres' Is Not Oracle Expertise"
description: "A tool that supports Oracle as one dialect among fifty doesn't understand Oracle — dialect-specific tooling is a foundation, not a feature."
date: "2026-07-02"
slug: "postgres-is-not-oracle-expertise"
lang: "en"
kind: "manifesto"
tags: ["oracle", "developer-tools", "sql-dialects", "ai", "tooling"]
translation_slug: "postgres-nao-e-expertise-oracle"
read_minutes: 2
author: "claude-agent"
hero: "/datamap-hero.png"
---

There is a category of database tool that describes itself as supporting "60+ databases, including Oracle." Oracle is on the list. The connection wizard has a dropdown. The schema browser will show you tables.

This is not Oracle expertise.

Oracle expertise means knowing that `FETCH FIRST 10 ROWS ONLY` landed in 12c and that the 11g production instance in your client's data center still needs `ROWNUM` instead. It means knowing that `CONNECT BY PRIOR` is not a legacy quirk to be rewritten into a recursive CTE — it is often the right choice, and the cost-based optimizer knows how to run it. It means knowing that when the AI suggests removing your hints, it is wrong, and being able to tell you why.

A generic tool learns none of this. It has a driver, a SQL console, and perhaps a schema browser that stumbles on Oracle's `ALL_` views. The developer using it still carries all the Oracle knowledge in their head — the tool just provides a window to type into.

The gap shows up everywhere. You paste a query into a generic AI assistant and it generates `LIMIT` syntax, or rewrites your `MERGE` statement with logic that doesn't parse on 11g, or confidently strips the `/*+ INDEX(t idx_created) */` hint because it looks like a comment to a model that has mostly seen Postgres. The tool didn't warn you. It didn't know enough to warn you.

This is not a knock on the people building general-purpose tools. Covering 60 dialects is hard, and it is a legitimate product. But it is a different product from an Oracle-native tool, and the difference is not about coverage — it is about depth. A tool built on Oracle-specific knowledge can gate features by server version. It can tell the AI exactly what the connected instance understands. It can refuse to suggest syntax the target server cannot execute.

The bar for "Oracle support" has been set far too low for too long. A connection that doesn't crash is not expertise. A schema browser that lists tables is not expertise. Expertise is knowing that `DBMS_STATS.GATHER_TABLE_STATS` has a different parameter signature on 11g than on 19c, and surfacing the right one when the developer hovers over it.

Veesker was built from the beginning with Oracle as the only target. That constraint is the product. The Community Edition is Apache 2.0 and [free to download](/download). If you want the managed AI layer that keeps that dialect knowledge current as you query, [join the Cloud waitlist](/#waitlist) — GA H2 2026, $29 USD/seat/month, founder pricing locked for early members.

— *Veesker*
