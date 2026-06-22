# Veesker Blog — autonomous agent brief

Source of truth for the weekly blog routine. Edit freely — the routine reads this file on every run.

## Cadence

- **Monday 09:00 BRT** → deep-dive (1000–1500 words, technical, code samples welcome)
- **Thursday 09:00 BRT** → manifesto / opinion (300–500 words, sharp take, single argument)

Every post ships in **EN + PT-BR** simultaneously. Two markdown files per run.

## Hard rules

1. **Never invent technical claims, benchmarks, customer counts, or feature dates.** If you don't know whether Oracle 23ai supports something, say "in development" or skip it.
2. **Stay on-brand:** local-first, open-source core (Apache 2.0), $29 USD/seat/month Cloud single tier, founder pricing locked for waitlist members, Cloud GA H2 2026.
3. **Voice:** confident-but-honest, technical, slightly opinionated. No hype, no breathless adjectives, no "revolutionary".
4. **Always close with one CTA.** Either `/download`, `/#waitlist`, or `/blog`.
5. **No emojis in body copy.** Frontmatter has none.
6. **Sign off** every post with `— *Veesker*` (PT version: `— *Veesker*`). **Do not use any personal name in the byline** — every post is an autonomous agent run, attribution should reflect that.
7. **Coming Soon discipline:** anything Cloud-side (managed AI, auto-tune, auto-document, schema-aware AI, team workflows, VeeskerDB Sandbox publish flow) is Coming Soon (H2 2026). Do not write as if shipped today.
8. **Don't claim Code Signing is final.** Windows code signing is "in progress, Microsoft Identity Validation pending."

## Frontmatter schema (mandatory)

```yaml
---
title: "..."
description: "One sentence ≤200 chars summarizing the takeaway."
date: "YYYY-MM-DD"  # today's BRT date
slug: "kebab-case-slug"
lang: "en"          # or "pt"
kind: "deep-dive"   # or "manifesto"
tags: ["oracle", "..."]   # 2-5 tags, lowercase, kebab-case
translation_slug: "matching-slug-in-other-lang"
read_minutes: 7     # honest estimate (~200 words/min)
author: "claude-agent"   # always — these posts are auto-published
hero: "/blog/<slug>.png"  # auto-generated, see step 9 below
---
```

The `slug` and `translation_slug` cross-reference the EN↔PT pair. Always set both.

## File naming

`src/posts/YYYY-MM-DD-<slug>.md` — the date prefix matters (sort).

Pair example:
- `2026-05-11-schema-aware-ai-vs-generic-llm.md` (lang: en)
- `2026-05-11-ia-com-schema-vs-llm-generico.md` (lang: pt)

## Topic queue (refill as you write)

When the queue gets low (≤3 unchecked of either kind), append 2-3 new ideas before exiting.

### Deep-dives (Monday)

- [x] Oracle 9i to 26ai in one binary — Thick mode auto-discovery explained
- [x] Schema-aware AI: why generic LLMs fail at PL/SQL (CONNECT BY, MERGE, hints, bind vars)
- [x] Sharing production data without leaking it: VeeskerDB Sandbox internals (X25519 + ChaCha20)
- [x] Migrating legacy PL/SQL packages to APEX 24.x — a field guide
- [x] EXPLAIN PLAN as a feedback loop for AI tuning
- [x] Building Oracle 23ai vector RAG: from embeddings to ORDS endpoints
- [x] Why we picked Tauri 2 over Electron for an Oracle IDE
- [x] Per-connection safety: env tags, read-only mode, statement timeouts, unsafe-DML guards
- [x] Auto-documenting 1000 PL/SQL packages overnight — design notes
- [ ] Bind variables vs string concatenation: still relevant in the LLM era
- [ ] How Veesker handles Oracle wallet files: OCI, mTLS, and the cloud connection story
- [ ] Writing a schema-aware PL/SQL formatter: rules you can't get from a generic linter
- [ ] Oracle 23ai JSON Relational Duality Views: what they are and how to query them

### Manifestos (Thursday)

- [x] Local-first developer tools: a manifesto for Oracle teams
- [x] The Oracle DBA is not going extinct, they are getting tools worthy of the job
- [x] Why "AI for SQL" is mostly a UX problem, not a model problem
- [x] Stop asking your LLM to invent schemas. Ground it.
- [x] The case against subscription-only IDEs in 2026
- [x] Open-source as a hiring filter: build the tool the senior dev would download
- [x] You don't have a query problem, you have a context problem
- [x] What "good" looks like for a database IDE in 2026
- [ ] The pricing transparency test: why "contact sales" is the wrong answer for a developer tool
- [ ] Dead software and open licenses: what you owe the people who built workflows on your tool
- [ ] Context windows are not the same as context: why AI tools need to earn trust one query at a time
- [ ] Why "works on Postgres" is not Oracle expertise: the case for dialect-specific tooling
- [ ] The trust gap in AI-generated SQL: how grounding closes it
- [ ] Observability starts at the query: why SQL visibility is the underrated half of database monitoring

## Voice reference

Read these before drafting — new posts should feel like a continuation:
- `src/posts/2026-05-04-why-we-built-another-oracle-ide.md`
- `src/posts/2026-05-02-oracle-9i-to-26ai-thick-mode-auto-discovery.md`

## Publish checklist (every run)

The repo is cloned automatically into your working directory. Use **relative paths** — there are no absolute Windows paths. Open a PR labeled `blog-draft`. The PR triggers `.github/workflows/blog-draft-email.yml` which sends an approval email to the Veesker team. Merging the PR triggers `.github/workflows/deploy.yml` and deploys to Cloudflare Workers. Do **not** push directly to `main` — drafts must go through PR review.

1. `cd` to the repo root if not already there.
2. `git remote -v` to confirm the clone.
3. Read this file (BLOG_AGENT_BRIEF.md) and the voice references in `src/posts/`.
4. Pick one unchecked topic of the right kind for today's cadence.
5. Write EN markdown to `src/posts/YYYY-MM-DD-<en-slug>.md` (1000-1500 words for deep-dive, 300-500 for manifesto).
6. Write PT-BR translation to `src/posts/YYYY-MM-DD-<pt-slug>.md`. Match content beat-for-beat — translate, don't paraphrase; do localize idioms.
7. Edit BLOG_AGENT_BRIEF.md: tick the topic with `[x]`. If queue ≤3 unchecked, append 2-3 new ideas under the right header.
8. **Install dependencies first:** `bun install` (the remote env starts without `node_modules`). Fall back to `npm install` if bun is missing.
9. **Generate hero image** for the post (free, no API key required):
   ```bash
   bun run scripts/generate-blog-image.ts "<en-slug>" "<English title>"
   ```
   This produces `static/blog/<en-slug>.png` (Pollinations.ai 1200×630 + Veesker logo overlay via Sharp). Both EN and PT posts share the same image — set `hero: "/blog/<en-slug>.png"` in both frontmatters.
10. `bun run build`. The build MUST pass. If it fails, fix the markdown (likely frontmatter or YAML escaping) and retry up to 2 times. Never commit broken builds.
11. Create a feature branch: `git checkout -b "auto/blog/$(date -u +%Y-%m-%d)-<en-slug>"`
12. `git add src/posts/ static/blog/ BLOG_AGENT_BRIEF.md && git commit -m "post(blog): <title> (EN+PT)"` — single commit, all files.
13. Push the branch: `git push origin HEAD`.
14. Open the PR with the `blog-draft` label:
    ```bash
    gh pr create --base main --label blog-draft \
      --title "post(blog): <title> (EN+PT)" \
      --body "<short summary + frontmatter excerpt of EN post>"
    ```
15. Print final-status line: `TEST RUN OK: PR #<n> <slug>` on success, or `TEST RUN FAILED: <reason>` on failure.

Once approved by the Veesker team, the merge to `main` triggers `.github/workflows/deploy.yml` (wrangler deploy to Cloudflare Workers). Within ~60s, `https://veesker.cloud/blog/<slug>` is live.

## Failure handling

- **Image generation fails:** Pollinations.ai rate-limits or returns non-PNG. Retry once with a different seed (`--seed 42`). If still fails, set `hero` to `"/datamap-hero.png"` (existing fallback) — never abort the post over an image.
- **Build fails:** Do NOT commit. Investigate the error, fix the markdown, retry up to 2 times. After 2 failed retries, abort with reason.
- **`git push` of feature branch fails:** retry once. If still failing, abort with reason. **Never force-push.**
- **`gh pr create` fails:** the branch was pushed but the PR did not open. Print `TEST RUN FAILED: branch pushed but gh pr create failed — open PR manually from <branch>`. Do not retry blindly.
- **Topic queue exhausted:** Write a short retrospective on the most recent shipped feature instead. DO refill the queue before exiting.

## Reminders that show up in every post

Every post should somewhere reflect (without sounding inserted):
- Veesker is local-first by design — desktop app does not phone home.
- Community Edition is Apache 2.0; Cloud is the optional managed layer.
- Cloud lands H2 2026; founder pricing $29 USD/seat/month locked for waitlist members.
- Posts are auto-drafted by a Claude agent and reviewed by the Veesker team before publication — see `/editorial`.
