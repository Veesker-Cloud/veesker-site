<script lang="ts">
  import Seo from "$lib/seo.svelte";
  import AnimatedBorder from "$lib/components/AnimatedBorder.svelte";
  import ScrollReveal from "$lib/components/ScrollReveal.svelte";

  type Release = {
    version: string;
    date: string;
    title: string;
    tag: "feature" | "fix" | "security" | "milestone";
    highlights: string[];
  };

  // Newest first. Manually curated — bumped on each meaningful release.
  // Dates match actual git tag commit dates (verified against git log --tags).
  const releases: Release[] = [
    {
      version: "v0.5.0-beta.1",
      date: "2026-05-11",
      title: "Phase 1 complete — Schema browser, safety gates, HMAC audit chain",
      tag: "feature",
      highlights: [
        "Safety gates for PROD work — workspace classification (DEV/STAGING/PROD), confirmation prompts on destructive operations, DDL preview, session-level guardrails.",
        "Complete schema browser — tables, views, sequences, procedures, functions, packages, triggers, types, plus per-schema vector indicator (Oracle 23ai).",
        "HMAC-chained audit log — every action recorded with cryptographic chain (tamper-evident). Local-only, no telemetry.",
        "Table inspector — columns, indexes, related objects (FKs, dependents, constraints, grants), DataFlow graph with PL/SQL body scans.",
        "Multi-platform builds — Windows NSIS, macOS arm64 (Apple Silicon), Linux deb/rpm.",
        "Ed25519-signed auto-updater — future releases will install automatically.",
      ],
    },
    {
      version: "v0.2.5",
      date: "2026-04-27",
      title: "Wallet hardening + cancel/execute fix",
      tag: "fix",
      highlights: [
        "Oracle Wallet file size cap (1MB) — prevent accidental upload of database dumps mistaken for wallet bundles.",
        "Cancel-vs-execute race condition fixed — query cancellation no longer triggers spurious execute on retry.",
        "Squashfs-tools added to Linux CI for AppImage bundle integrity.",
        "tauri.conf.json BOM removed — fixes Windows build edge case.",
      ],
    },
    {
      version: "v0.2.4",
      date: "2026-04-27",
      title: "Site refresh + Cloud waitlist backend + Sandbox Plan 5b (preview, not yet released)",
      tag: "feature",
      highlights: [
        "Site refresh: real Cloud waitlist backend (api.veesker.cloud), competitive comparison table, personas section, dedicated /security page, /blog with EN+PT-BR cadence.",
        "VeeskerDB Sandbox Plan 5b — owner publish wizard (Steps 1-5) + member open/query/close via local DuckDB shipped to the codebase. Preview only — not in the v0.2.4 download yet. Will land in the next public binary release.",
        "Multi-agent security review pass 2: JWT identity refactored to Rust + sidecar, R2 SHA verification, replay defense, lookup throttling.",
      ],
    },
    {
      version: "v0.2.3",
      date: "2026-04-26",
      title: "Sandbox Plan 4 — member open flow + Plan 3 BYOC published",
      tag: "feature",
      highlights: [
        "Member-side open / query / close via DuckDB local (engine 143 + sidecar 346 tests).",
        "Sandbox publish/pull pivoted to Veesker-hosted via Cloudflare R2 (BYOC cancelled — simpler ops).",
        "api.veesker.cloud went LIVE (Cloudflare Pages → Railway).",
        "12 commits across CE + CL + API.",
      ],
    },
    {
      version: "v0.2.2",
      date: "2026-04-26",
      title: "Comprehensive security audit — 16 findings resolved",
      tag: "security",
      highlights: [
        "16 findings across credential storage, SQL safety, audit logging, error reflection.",
        "Migrations 004-006 hardened the auth/audit path.",
        "Resolved across 4 batches + ultrareview pass.",
        "Production now matches DBeaver EE security posture.",
      ],
    },
    {
      version: "v0.2.1",
      date: "2026-04-26",
      title: "Per-connection safety milestone + free security CI",
      tag: "milestone",
      highlights: [
        "Four per-connection safety guards: env tags, read-only mode, statement timeouts, unsafe-DML confirmations.",
        "Dependabot, CodeQL, OSV-Scanner CI added on the open repo.",
        "New Tauri updater signing key (Ed25519).",
      ],
    },
    {
      version: "v0.2.0",
      date: "2026-04-26",
      title: "First public release — veesker.cloud LIVE",
      tag: "milestone",
      highlights: [
        "Windows installer with built-in auto-updater shipped.",
        "Marketing site veesker.cloud + www LIVE on Cloudflare.",
        "18 ultra-review fixes shipped before go-live.",
        "SaaS architecture spec + plan committed (app.veesker.cloud build path).",
      ],
    },
  ];

  function tagLabel(t: Release["tag"]): string {
    return { feature: "Feature", fix: "Fix", security: "Security", milestone: "Milestone" }[t];
  }
</script>

<Seo
  title="Changelog"
  description="What shipped in Veesker recently. Releases, security updates, and milestones."
  path="/changelog"
  image="/datamap-hero.png"
  imageAlt="Veesker recent shipped milestones"
/>

<ScrollReveal>
  <section class="hero">
    <div class="container">
      <div class="eyebrow">What shipped recently</div>
      <h1>Changelog.</h1>
      <p class="lead">
        Veesker ships in public. Every release, security fix, and milestone is announced here and on the
        <a href="https://github.com/veesker-cloud/veesker-community-edition/releases" target="_blank" rel="noopener">GitHub releases page</a>.
      </p>
    </div>
  </section>
</ScrollReveal>

<section class="releases">
  <div class="container">
    <ol class="release-list">
      {#each releases as r, i (r.version)}
        {#if i === 0}
          <AnimatedBorder speed="5s" borderRadius="12px" innerBg="var(--bg-soft)">
            <li class="release {r.tag}">
              <div class="release-meta">
                <span class="release-version">{r.version}</span>
                <span class="release-date">{r.date}</span>
                <span class="release-tag tag-{r.tag}">{tagLabel(r.tag)}</span>
              </div>
              <h2 class="release-title">{r.title}</h2>
              <ul class="release-highlights">
                {#each r.highlights as line}
                  <li>{line}</li>
                {/each}
              </ul>
            </li>
          </AnimatedBorder>
        {:else}
          <ScrollReveal>
            <li class="release {r.tag}">
              <div class="release-meta">
                <span class="release-version">{r.version}</span>
                <span class="release-date">{r.date}</span>
                <span class="release-tag tag-{r.tag}">{tagLabel(r.tag)}</span>
              </div>
              <h2 class="release-title">{r.title}</h2>
              <ul class="release-highlights">
                {#each r.highlights as line}
                  <li>{line}</li>
                {/each}
              </ul>
            </li>
          </ScrollReveal>
        {/if}
      {/each}
    </ol>

    <div class="more">
      <p>
        Looking for older releases? See the
        <a href="https://github.com/veesker-cloud/veesker-community-edition/releases" target="_blank" rel="noopener">full release archive on GitHub</a>.
      </p>
    </div>
  </div>
</section>

<style>
  .hero {
    padding: 80px 0 40px;
    text-align: center;
  }
  .eyebrow {
    display: inline-block;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #fdba74;
    background: rgba(249, 115, 22, 0.12);
    border: 1px solid rgba(249, 115, 22, 0.32);
    border-radius: 100px;
    padding: 5px 14px;
    margin-bottom: 18px;
  }
  h1 {
    font-size: 48px;
    margin: 0 0 18px;
    letter-spacing: -0.02em;
  }
  .lead {
    color: var(--text-muted);
    font-size: 17px;
    line-height: 1.65;
    max-width: 740px;
    margin: 0 auto;
  }
  .lead a {
    color: var(--accent-text);
  }

  .releases {
    padding: 30px 0 80px;
  }
  .release-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .release {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 26px 28px;
    border-left-width: 4px;
  }
  .release.feature {
    border-left-color: rgba(138, 216, 251, 0.55);
  }
  .release.fix {
    border-left-color: #b6f0c1;
  }
  .release.security {
    border-left-color: #ff9f7a;
  }
  .release.milestone {
    border-left-color: #fdba74;
  }
  .release-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .release-version {
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    background: rgba(245, 241, 232, 0.06);
    border: 1px solid var(--border);
    padding: 3px 10px;
    border-radius: 6px;
  }
  .release-date {
    font-size: 12px;
    color: var(--text-muted);
    font-family: "JetBrains Mono", monospace;
    letter-spacing: 0.04em;
  }
  .release-tag {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 9px;
    border-radius: 100px;
  }
  .tag-feature {
    background: rgba(43, 180, 238, 0.18);
    color: #b9ebff;
    border: 1px solid rgba(138, 216, 251, 0.4);
  }
  .tag-fix {
    background: rgba(102, 217, 137, 0.16);
    color: #b6f0c1;
    border: 1px solid rgba(102, 217, 137, 0.4);
  }
  .tag-security {
    background: rgba(255, 159, 122, 0.18);
    color: #ffb89c;
    border: 1px solid rgba(255, 159, 122, 0.4);
  }
  .tag-milestone {
    background: rgba(251, 186, 116, 0.18);
    color: #fdba74;
    border: 1px solid rgba(249, 115, 22, 0.4);
  }
  .release-title {
    font-size: 19px;
    line-height: 1.35;
    margin: 0 0 14px;
  }
  .release-highlights {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .release-highlights li {
    padding: 6px 0 6px 18px;
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.6;
    position: relative;
  }
  .release-highlights li::before {
    content: "→";
    position: absolute;
    left: 0;
    color: var(--accent-text);
  }

  .more {
    max-width: 860px;
    margin: 36px auto 0;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
  }
  .more a {
    color: var(--accent-text);
  }

  @media (max-width: 820px) {
    h1 {
      font-size: 36px;
    }
    .release {
      padding: 20px 20px;
    }
  }
</style>
