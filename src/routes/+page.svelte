<script lang="ts">
  import { browser } from "$app/environment";
  import Seo from "$lib/seo.svelte";
  import { onMount } from "svelte";
  import AuroraBackground from "$lib/components/AuroraBackground.svelte";
  import MeteorShower from "$lib/components/MeteorShower.svelte";
  import ShimmerText from "$lib/components/ShimmerText.svelte";
  import ScrollReveal from "$lib/components/ScrollReveal.svelte";
  import AnimatedBorder from "$lib/components/AnimatedBorder.svelte";
  import MagicCard from "$lib/components/MagicCard.svelte";
  import MagneticButton from "$lib/components/MagneticButton.svelte";
  import GridBeams from "$lib/components/GridBeams.svelte";
  import PipelineSpine from "$lib/components/PipelineSpine.svelte";
  import SchemaHero from "$lib/components/SchemaHero.svelte";
  import TextSplit from "$lib/components/TextSplit.svelte";
  import ConduitTubes from "$lib/components/ConduitTubes.svelte";
  import SqlDivider from "$lib/components/SqlDivider.svelte";

  let activeLayer = $state<"community" | "cloud" | null>(null);

  function updateActiveLayerFromHash() {
    if (!browser) return;
    const hash = window.location.hash.toLowerCase();
    activeLayer = hash === "#community" ? "community" : hash === "#cloud" ? "cloud" : null;
  }

  onMount(() => {
    updateActiveLayerFromHash();
    window.addEventListener("hashchange", updateActiveLayerFromHash);
    return () => window.removeEventListener("hashchange", updateActiveLayerFromHash);
  });

  const API_BASE = "https://api.veesker.cloud";

  const SECTION_DIVIDERS = {
    heroToShowcase:     "SELECT capability FROM platforms WHERE oracle_native = 'Y';",
    showcaseToSandbox:  "BEGIN sandbox.share('ORDERS', p_recipient => 'partner@veesker.cloud'); END;",
    sandboxToFeatures:  "SELECT name FROM dba_features WHERE released = 'Y';",
    featuresToPersonas: "SELECT role, COUNT(*) FROM dba_users GROUP BY role;",
    personasToPlatform: "SELECT edition, version FROM v$instance;",
    securityToWaitlist: "INSERT INTO waitlist (email, signed_up_at) VALUES (?, SYSDATE);",
  } as const;

  let waitlistEmail = $state("");
  let waitlistStatus = $state<"idle" | "submitting" | "success" | "rate_limited" | "error">("idle");
  let waitlistError = $state("");

  async function submitWaitlist(e: Event) {
    e.preventDefault();
    if (waitlistStatus === "submitting") return;
    waitlistStatus = "submitting";
    waitlistError = "";
    try {
      const res = await fetch(`${API_BASE}/v1/cloud-waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitlistEmail, source: "veesker.cloud" }),
      });
      if (res.ok) {
        waitlistStatus = "success";
        waitlistEmail = "";
        return;
      }
      if (res.status === 429) {
        waitlistStatus = "rate_limited";
        return;
      }
      waitlistStatus = "error";
      waitlistError = "Could not submit. Try again in a moment.";
    } catch (err) {
      waitlistStatus = "error";
      waitlistError = "Network error. Check your connection and try again.";
    }
  }
</script>

<Seo
  title="Veesker Platform"
  description="Oracle development platform for the AI agent era. Free local-first IDE supporting Oracle 9i through 26ai, plus optional Veesker Cloud for managed intelligence."
  path="/"
/>

<PipelineSpine />

<section class="hero">
  <SchemaHero />
  <AuroraBackground speed={0.9} intensity={0.26} />
  <MeteorShower count={8} />
  <div class="container hero-inner" style="position:relative;z-index:2;">
    <picture class="hero-logo-wrap">
      <source
        type="image/avif"
        srcset="/veesker-mascot-480.avif 480w, /veesker-mascot-960.avif 960w"
        sizes="(max-width: 600px) 220px, 300px"
      />
      <source
        type="image/webp"
        srcset="/veesker-mascot-480.webp 480w, /veesker-mascot-960.webp 960w"
        sizes="(max-width: 600px) 220px, 300px"
      />
      <img src="/veesker-mascot.png" alt="Veesker Platform" class="hero-logo" width="1080" height="1080" />
    </picture>
    <div class="badge">Built for Oracle 9i → 26ai</div>
    <ShimmerText as="h1">The Oracle development<br />platform for the AI era.</ShimmerText>
    <ScrollReveal delay={0.15}>
      <p class="lead">
        Free local-first IDE today. Optional Veesker Cloud (Coming Soon — H2 2026) when your team needs managed intelligence.
      </p>
    </ScrollReveal>
    <ScrollReveal delay={0.25}>
      <div class="hero-signals" aria-label="Primary value claims">
        <span class="hero-signal">Free and open source</span>
        <span class="hero-signal">Database stays local</span>
        <span class="hero-signal">Apache 2.0</span>
        <span class="hero-signal">Cloud is optional</span>
      </div>
    </ScrollReveal>
    <ScrollReveal delay={0.35}>
      <div class="cta">
        <MagneticButton strength={0.28} radius={70}>
          <a href="/download" class="btn primary cta-btn">
            <span class="cta-icon-wrap">
              <img src="/veesker-community-logo.png" alt="" aria-hidden="true" class="cta-icon ce-icon" width="1024" height="1024" />
            </span>
            <span>Download Community</span>
          </a>
        </MagneticButton>
        <MagneticButton strength={0.28} radius={70}>
          <a href="/pricing#cloud" class="btn cloud cta-btn">
            <span class="cta-icon-wrap cloud">
              <img src="/veesker-cloud-logo.png" alt="" aria-hidden="true" class="cta-icon cloud-icon" width="1536" height="1024" />
            </span>
            <span>Learn about Cloud →</span>
          </a>
        </MagneticButton>
      </div>
    </ScrollReveal>
    <div class="social-proof" aria-label="Open-source signals">
      <a href="https://github.com/veesker-cloud/veesker-community-edition" target="_blank" rel="noopener" class="proof-badge">
        <img alt="GitHub stars" src="https://img.shields.io/github/stars/veesker-cloud/veesker-community-edition?style=flat-square&color=fdba74&labelColor=14110e" />
      </a>
      <a href="https://github.com/veesker-cloud/veesker-community-edition/releases/latest" target="_blank" rel="noopener" class="proof-badge">
        <img alt="Latest release" src="https://img.shields.io/github/v/release/veesker-cloud/veesker-community-edition?style=flat-square&color=9ce2ff&labelColor=14110e" />
      </a>
      <a href="https://github.com/veesker-cloud/veesker-community-edition/blob/main/LICENSE" target="_blank" rel="noopener" class="proof-badge">
        <img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-fdba74?style=flat-square&labelColor=14110e" />
      </a>
      <a href="https://github.com/veesker-cloud/veesker-community-edition/security" target="_blank" rel="noopener" class="proof-badge">
        <img alt="CodeQL + Dependabot" src="https://img.shields.io/badge/security-CodeQL%20%2B%20Dependabot-9ce2ff?style=flat-square&labelColor=14110e" />
      </a>
    </div>
  </div>
</section>

<SqlDivider sql={SECTION_DIVIDERS.heroToShowcase} />

<ScrollReveal>
  <section class="screenshot-showcase" aria-labelledby="screenshot-title">
    <div class="container">
      <h2 id="screenshot-title" class="visually-hidden">Veesker workspace overview</h2>
      <figure class="screenshot-wrap">
        <img
          src="/workspace-overview.png"
          alt="Veesker Community Edition workspace — SQL editor with PL/SQL highlighting, schema browser on the left, results grid below, and the AI assistant panel on the right"
          loading="lazy"
          class="screenshot"
        />
        <figcaption>The full Veesker workspace — editor, schema browser, results grid, and AI assistant in a single window.</figcaption>
      </figure>
    </div>
  </section>
</ScrollReveal>

<SqlDivider sql={SECTION_DIVIDERS.showcaseToSandbox} />

<section class="vdb-showcase" aria-labelledby="vdb-title">
  <div class="container">
    <div class="vdb-eyebrow">VeeskerDB Sandbox · Cloud feature</div>
    <ScrollReveal clipReveal={true}>
      <ShimmerText as="h2" shimmerColor="#8ad8fb" id="vdb-title">Production data, safely shared.</ShimmerText>
    </ScrollReveal>
    <ScrollReveal delay={0.1}>
      <p class="vdb-lead">
        Send a live slice of your Oracle database to your team — encrypted end-to-end, PII auto-masked, queryable locally as DuckDB.
      </p>
    </ScrollReveal>

    <ScrollReveal>
      <figure class="vdb-diagram-wrap">
        <img
          src="/datamap-hero.png"
          alt="Veesker system datamap — Desktop Client with SQL editor and AI Sheep talking to Veesker Cloud API (Auth, Sandbox, Audit Log) which connects to Oracle Database 9i to 26ai, with Postgres and Cloudflare R2 alongside"
          width="2752"
          height="1536"
          loading="lazy"
          class="vdb-diagram"
        />
        <figcaption class="vdb-diagram-caption">
          Desktop Client → Veesker Cloud API → Oracle. The Sandbox flow rides this same path — encrypted blobs uploaded to R2, sealed envelopes brokered through the API, never plaintext on our servers.
        </figcaption>
      </figure>
    </ScrollReveal>

    <ScrollReveal stagger={0.12}>
      <ConduitTubes>
        <MagicCard class="vdb-card" glowColor="rgba(138, 216, 251, 0.32)" accentColor="rgba(138, 216, 251, 0.6)" secondaryColor="rgba(43, 180, 238, 0.55)" maxTilt={6}>
          <div class="vdb-step">
            <div class="vdb-step-num">01</div>
            <h3>Slice</h3>
            <p>Owner picks tables, FK depth, and TTL. Veesker walks the schema graph and stages a coherent extract.</p>
          </div>
        </MagicCard>
        <div class="conduit" aria-hidden="true">
          <div class="conduit-particle cp-1"></div>
          <div class="conduit-particle cp-2"></div>
        </div>
        <MagicCard class="vdb-card" glowColor="rgba(138, 216, 251, 0.32)" accentColor="rgba(138, 216, 251, 0.6)" secondaryColor="rgba(43, 180, 238, 0.55)" maxTilt={6}>
          <div class="vdb-step">
            <div class="vdb-step-num">02</div>
            <h3>Mask</h3>
            <p>Emails, phone numbers, and identifier columns are auto-detected and masked — hash, redact, static, or partial.</p>
          </div>
        </MagicCard>
        <div class="conduit" aria-hidden="true">
          <div class="conduit-particle cp-1"></div>
          <div class="conduit-particle cp-2"></div>
        </div>
        <MagicCard class="vdb-card" glowColor="rgba(138, 216, 251, 0.32)" accentColor="rgba(138, 216, 251, 0.6)" secondaryColor="rgba(43, 180, 238, 0.55)" maxTilt={6}>
          <div class="vdb-step">
            <div class="vdb-step-num">03</div>
            <h3>Encrypt</h3>
            <p>Per-recipient X25519 envelopes, ChaCha20-Poly1305 content. Veesker servers never see plaintext.</p>
          </div>
        </MagicCard>
        <div class="conduit" aria-hidden="true">
          <div class="conduit-particle cp-1"></div>
          <div class="conduit-particle cp-2"></div>
        </div>
        <MagicCard class="vdb-card" glowColor="rgba(138, 216, 251, 0.32)" accentColor="rgba(138, 216, 251, 0.6)" secondaryColor="rgba(43, 180, 238, 0.55)" maxTilt={6}>
          <div class="vdb-step">
            <div class="vdb-step-num">04</div>
            <h3>Open</h3>
            <p>Member pulls, decrypts locally, and runs full SQL on an in-memory DuckDB. Milliseconds, no network.</p>
          </div>
        </MagicCard>
      </ConduitTubes>
    </ScrollReveal>

    <ScrollReveal>
      <div class="vdb-meta">
        <span class="vdb-pill">Available with Veesker Cloud · Coming Soon — H2 2026</span>
        <span class="vdb-format">
          Open <code>.vsk</code> format · engine source on
          <a href="https://github.com/veesker-cloud/veesker-community-edition" target="_blank" rel="noopener">GitHub</a>
        </span>
      </div>
    </ScrollReveal>
  </div>
</section>

<SqlDivider sql={SECTION_DIVIDERS.sandboxToFeatures} />

<section class="features">
  <div class="container">
    <ScrollReveal clipReveal={true}>
      <h2>Community Edition is complete, local-first, and built for Oracle developers.</h2>
    </ScrollReveal>
    <ScrollReveal stagger={0.08}>
      <div class="feat-grid">
        <MagicCard class="feat" maxTilt={6} animatedBorder={false}>
          <div class="feat-inner">
            <div class="feat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <ellipse cx="12" cy="5" rx="8" ry="3"/>
                <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
                <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>
              </svg>
            </div>
            <h3>Full SQL and PL/SQL IDE</h3>
            <p>Run multi-statement SQL, inspect large result sets, and debug production-grade PL/SQL workflows.</p>
          </div>
        </MagicCard>
        <MagicCard class="feat" maxTilt={6} animatedBorder={false}>
          <div class="feat-inner">
            <div class="feat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="6" width="18" height="14" rx="2"/>
                <path d="M8 2v4M16 2v4M3 10h18"/>
                <circle cx="8" cy="14" r="1.4" fill="currentColor"/>
              </svg>
            </div>
            <h3>PL/SQL debugger</h3>
            <p>Breakpoints, step controls, watches, call stack, DBMS_OUTPUT capture, and cursor extraction.</p>
          </div>
        </MagicCard>
        <MagicCard class="feat" maxTilt={6} animatedBorder={false}>
          <div class="feat-inner">
            <div class="feat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h7l2 2h9v11a2 2 0 0 1-2 2H3z"/>
                <path d="M3 6V4a1 1 0 0 1 1-1h4l2 2"/>
              </svg>
            </div>
            <h3>Schema browser</h3>
            <p>Explore object graphs, inspect dependencies, and navigate large Oracle schemas with less friction.</p>
          </div>
        </MagicCard>
        <MagicCard class="feat" maxTilt={6} animatedBorder={false}>
          <div class="feat-inner">
            <div class="feat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
              </svg>
            </div>
            <h3>VRAS — Veesker REST API Studio</h3>
            <p>Build ORDS endpoints faster with API studio workflows integrated into your Oracle workspace.</p>
          </div>
        </MagicCard>
        <MagicCard class="feat" maxTilt={6} animatedBorder={false}>
          <div class="feat-inner">
            <div class="feat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2 4 6v6c0 4.4 3.4 8.5 8 10 4.6-1.5 8-5.6 8-10V6z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <h3>Vector tools</h3>
            <p>Create embeddings, tune indexes, and run similarity workflows with local or managed providers.</p>
          </div>
        </MagicCard>
        <MagicCard class="feat" maxTilt={6} animatedBorder={false}>
          <div class="feat-inner">
            <div class="feat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>
                <circle cx="12" cy="12" r="3.5"/>
              </svg>
            </div>
            <h3>BYOK AI — Bring Your Own Key</h3>
            <p>Plug your OpenAI / Anthropic / local key for explain-and-generate without forcing your workflow into a paywall.</p>
          </div>
        </MagicCard>
      </div>
    </ScrollReveal>
  </div>
</section>

<SqlDivider sql={SECTION_DIVIDERS.featuresToPersonas} />

<section class="personas" aria-labelledby="personas-title">
  <div class="container">
    <ScrollReveal clipReveal={true}>
      <h2 id="personas-title">Built for Oracle teams that ship.</h2>
    </ScrollReveal>
    <ScrollReveal delay={0.1}>
      <p class="personas-lead">Three patterns we hear weekly from teams adopting Veesker.</p>
    </ScrollReveal>
    <ScrollReveal stagger={0.1}>
      <div class="persona-grid">
        <MagicCard class="persona-wrap" maxTilt={5} animatedBorder={false}>
          <article class="persona">
            <h3>The financial DBA</h3>
            <p>
              Running Oracle 11g/19c on EBS with strict change windows. Wants a modern editor that won't crash on
              1M-row result grids and won't ship credentials to anyone's cloud.
            </p>
          </article>
        </MagicCard>
        <MagicCard class="persona-wrap" maxTilt={5} animatedBorder={false}>
          <article class="persona">
            <h3>The PL/SQL → APEX migrator</h3>
            <p>
              Refactoring legacy packages into APEX 24.x apps. Needs schema-aware navigation, a real debugger, and
              AI that understands Oracle dialects (not generic SQL).
            </p>
          </article>
        </MagicCard>
        <MagicCard class="persona-wrap" maxTilt={5} animatedBorder={false}>
          <article class="persona">
            <h3>The data engineer wiring AI</h3>
            <p>
              Building vector indexes on Oracle 23ai for RAG pipelines. Needs first-class embedding tools, ORDS
              endpoint scaffolding, and shareable extracts without exposing prod.
            </p>
          </article>
        </MagicCard>
      </div>
    </ScrollReveal>
  </div>
</section>

<SqlDivider sql={SECTION_DIVIDERS.personasToPlatform} />

<section class="platform" aria-labelledby="platform-title">
  <div class="container">
    <h2 id="platform-title">Community and Cloud, one platform.</h2>
    <p class="platform-lead">
      Start local with the open-source IDE. Add Veesker Cloud when your team needs managed intelligence.
    </p>
    <p class="layer-focus-note">
      {#if activeLayer === "community"}
        Focus: Community Edition (local-first open-source IDE).
      {:else if activeLayer === "cloud"}
        Focus: Veesker Cloud (optional managed intelligence layer).
      {:else}
        Compare both side by side.
      {/if}
    </p>

    <ScrollReveal stagger={0.12}>
      <div class="layer-grid">
        <MagicCard
          class="layer-magic community-magic"
          maxTilt={5}
          animatedBorder={false}
          glowColor="rgba(249, 115, 22, 0.28)"
        >
          <article
            class="layer-card community"
            id="community"
            class:focused={activeLayer === "community"}
            class:unfocused={activeLayer === "cloud"}
          >
            <div class="layer-head">
              <picture class="layer-art-wrap">
                <source
                  type="image/avif"
                  srcset="/veesker-community-logo-320.avif 320w, /veesker-community-logo-640.avif 640w"
                  sizes="(max-width: 980px) 90px, 112px"
                />
                <source
                  type="image/webp"
                  srcset="/veesker-community-logo-320.webp 320w, /veesker-community-logo-640.webp 640w"
                  sizes="(max-width: 980px) 90px, 112px"
                />
                <img
                  src="/veesker-community-logo.png"
                  alt="Veesker Community Edition"
                  width="1024"
                  height="1024"
                  loading="lazy"
                  class="layer-art"
                />
              </picture>
              <div>
                <h3>Community Edition</h3>
                <p>Local-first Oracle IDE</p>
                <span class="best-for">Best for: solo developers and local-first teams</span>
              </div>
            </div>
            <ul>
              <li>Full SQL / PL/SQL IDE</li>
              <li>Schema browser and debugger</li>
              <li>VRAS — Veesker REST API Studio</li>
              <li>Vector tools</li>
              <li>BYOK AI (your key, your control)</li>
              <li>Apache 2.0 open source</li>
            </ul>
            <a href="/download" class="btn primary layer-btn">Download Free</a>
          </article>
        </MagicCard>
        <MagicCard
          class="layer-magic cloud-magic"
          maxTilt={5}
          animatedBorder={true}
          glowColor="rgba(138, 216, 251, 0.32)"
          accentColor="rgba(138, 216, 251, 0.7)"
          secondaryColor="rgba(43, 180, 238, 0.55)"
        >
          <article
            class="layer-card cloud"
            id="cloud"
            class:focused={activeLayer === "cloud"}
            class:unfocused={activeLayer === "community"}
          >
            <div class="layer-head">
              <picture class="layer-art-wrap">
                <source
                  type="image/avif"
                  srcset="/veesker-cloud-logo-320.avif 320w, /veesker-cloud-logo-640.avif 640w"
                  sizes="(max-width: 980px) 90px, 112px"
                />
                <source
                  type="image/webp"
                  srcset="/veesker-cloud-logo-320.webp 320w, /veesker-cloud-logo-640.webp 640w"
                  sizes="(max-width: 980px) 90px, 112px"
                />
                <img
                  src="/veesker-cloud-logo.png"
                  alt="Veesker Cloud"
                  width="1536"
                  height="1024"
                  loading="lazy"
                  class="layer-art"
                />
              </picture>
              <div>
                <h3>Veesker Cloud</h3>
                <p>AI intelligence layer for Oracle teams</p>
                <span class="status">Coming Soon — H2 2026</span>
                <span class="best-for">Best for: managed AI, automation, and multi-dev workflows</span>
              </div>
            </div>
            <ul>
              <li>Schema-aware AI grounded in your Oracle DDL</li>
              <li>Managed AI — no API keys to provision per developer</li>
              <li>Auto-tune queries with EXPLAIN PLAN feedback</li>
              <li>Auto-document packages and procedures overnight</li>
              <li>VeeskerDB Sandbox — share masked extracts safely</li>
              <li>Team workflows with usage and billing</li>
            </ul>
            <a href="#waitlist" class="btn cloud layer-btn">Join Cloud waitlist →</a>
          </article>
        </MagicCard>
      </div>
    </ScrollReveal>
  </div>
</section>

<section class="comparison" aria-labelledby="comparison-title">
  <div class="container">
    <ScrollReveal clipReveal={true}><h2 id="comparison-title">How Veesker compares.</h2></ScrollReveal>
    <ScrollReveal delay={0.1}><p class="comparison-lead">
      Side-by-side with the tools Oracle developers already know.
    </p></ScrollReveal>
    <ScrollReveal>
      <div class="comparison-table-wrap">
        <table class="comparison-table">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col" class="us">Veesker</th>
              <th scope="col">SQL Developer</th>
              <th scope="col">PL/SQL Developer</th>
              <th scope="col">DBeaver</th>
            </tr>
          </thead>
          <tbody
            onmousemove={(e: MouseEvent) => {
              const tr = (e.target as HTMLElement).closest('tr');
              if (!tr) return;
              const rect = tr.getBoundingClientRect();
              (tr as HTMLElement).style.setProperty('--sx', `${e.clientX - rect.left}px`);
              (tr as HTMLElement).style.setProperty('--sy', `${e.clientY - rect.top}px`);
            }}
          >
            <tr class="table-row-spotlight">
              <th scope="row">Cross-platform (Win / macOS / Linux)</th>
              <td class="us">✓</td>
              <td>✓</td>
              <td>—</td>
              <td>✓</td>
            </tr>
            <tr class="table-row-spotlight">
              <th scope="row">Modern UI (built post-2020)</th>
              <td class="us">✓</td>
              <td>—</td>
              <td>—</td>
              <td>partial</td>
            </tr>
            <tr class="table-row-spotlight">
              <th scope="row">Oracle 9i → 26ai support</th>
              <td class="us">✓</td>
              <td>partial</td>
              <td>✓</td>
              <td>generic</td>
            </tr>
            <tr class="table-row-spotlight">
              <th scope="row">PL/SQL debugger</th>
              <td class="us">✓</td>
              <td>✓</td>
              <td>✓</td>
              <td>—</td>
            </tr>
            <tr class="table-row-spotlight">
              <th scope="row">Built-in AI (BYOK)</th>
              <td class="us">✓</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
            </tr>
            <tr class="table-row-spotlight">
              <th scope="row">Open source</th>
              <td class="us">Apache 2.0</td>
              <td>—</td>
              <td>—</td>
              <td>Apache 2.0</td>
            </tr>
            <tr class="table-row-spotlight">
              <th scope="row">Free for commercial use</th>
              <td class="us">✓</td>
              <td>✓</td>
              <td>—</td>
              <td>✓ (CE)</td>
            </tr>
          </tbody>
        </table>
        <p class="comparison-foot">Comparison reflects publicly documented features as of 2026. Accurate at time of publication; we update on release cadence.</p>
      </div>
    </ScrollReveal>
  </div>
</section>

<ScrollReveal>
<section class="security" aria-labelledby="security-title">
  <div class="container security-inner">
    <h2 id="security-title">Your database stays local.</h2>
    <p class="security-lead">
      Credentials, connections, and database access remain local to your machine.
      Cloud is opt-in and only powers managed intelligence workflows.
    </p>

    <div class="zones">
      <article class="zone local-zone">
        <h3>Local Zone</h3>
        <div class="architecture-row">
          <div class="node db">Oracle Database</div>
          <div class="arrow" aria-hidden="true">→</div>
          <div class="node desktop">Veesker Desktop</div>
        </div>
        <ul class="guarantees">
          <li>Credentials remain local</li>
          <li>Connections stay on your machine</li>
        </ul>
      </article>

      <article class="zone cloud-zone">
        <h3>Optional Cloud Zone</h3>
        <div class="architecture-row">
          <div class="node desktop">Veesker Desktop</div>
          <div class="arrow optional" aria-hidden="true">→ optional</div>
          <div class="node cloud">Veesker Cloud AI</div>
        </div>
        <ul class="guarantees">
          <li>Managed intelligence and optimization</li>
          <li>Team workflows and usage visibility</li>
        </ul>
      </article>
    </div>
  </div>
</section>
</ScrollReveal>

<SqlDivider sql={SECTION_DIVIDERS.securityToWaitlist} />

<section class="waitlist" id="waitlist" aria-labelledby="waitlist-title">
  <div class="container">
    <ScrollReveal>
      <AnimatedBorder speed="3s" borderRadius="16px" innerBg="radial-gradient(120% 100% at 0% 0%, rgba(43,180,238,0.18), transparent 46%), linear-gradient(165deg, rgba(22,29,36,0.96), rgba(16,22,29,0.97))">
        <div class="waitlist-card-inner">
          <div class="waitlist-copy">
            <span class="waitlist-eyebrow">Veesker Cloud · Coming Soon — H2 2026</span>
            <h2 id="waitlist-title">Join the Cloud waitlist.</h2>
            <p>
              Tell us your use case. Early waitlist members shape the feature roadmap and get founder pricing at launch.
            </p>
          </div>
          {#if waitlistStatus === "success"}
            <div class="waitlist-success" role="status">
              <div class="success-icon" aria-hidden="true">✓</div>
              <h3>You're on the list.</h3>
              <p>We'll email you when Veesker Cloud is ready. Founder pricing locked.</p>
            </div>
          {:else}
            <form class="waitlist-form" onsubmit={submitWaitlist}>
              <label class="visually-hidden" for="waitlist-email">Work email</label>
              <input
                id="waitlist-email"
                type="email"
                required
                placeholder="you@company.com"
                bind:value={waitlistEmail}
                autocomplete="email"
                disabled={waitlistStatus === "submitting"}
              />
              <button type="submit" class="btn primary waitlist-btn" disabled={waitlistStatus === "submitting"}>
                {waitlistStatus === "submitting" ? "Joining…" : "Join the waitlist →"}
              </button>
              {#if waitlistStatus === "rate_limited"}
                <p class="waitlist-error" role="alert">Too many requests. Wait a minute and try again.</p>
              {:else if waitlistStatus === "error"}
                <p class="waitlist-error" role="alert">{waitlistError}</p>
              {:else}
                <p class="waitlist-fineprint">
                  No spam, no third-party tracking. We email once when Cloud goes live. By submitting,
                  you agree to our <a href="/privacy">Privacy Policy</a>.
                </p>
              {/if}
            </form>
          {/if}
        </div>
      </AnimatedBorder>
    </ScrollReveal>
  </div>
</section>

<ScrollReveal stagger={0.06}>
<section class="faq-home" aria-labelledby="faq-title">
  <div class="container">
    <h2 id="faq-title">Common questions.</h2>
    <div class="faq-grid">
      <details>
        <summary>Will Community ever require a subscription?</summary>
        <p>No. Community Edition is Apache 2.0 and stays free forever. Cloud is the optional managed layer — it never gates the local IDE.</p>
      </details>
      <details>
        <summary>Does Veesker upload my database to the cloud?</summary>
        <p>Never. Connections and credentials live in your desktop install. Cloud features only run when you opt in, and Sandbox extracts are encrypted before they leave your machine.</p>
      </details>
      <details>
        <summary>Which Oracle versions are supported?</summary>
        <p>9i, 10g, 11g, 12c, 18c, 19c, 21c, 23ai, and the latest 26ai — Thick mode auto-discovery + bundled bindings, no per-user setup.</p>
      </details>
      <details>
        <summary>Can I use my own AI provider?</summary>
        <p>Yes. BYOK ships in Community: bring an OpenAI, Anthropic, or local-model key. Veesker Cloud (Coming Soon) handles the keys for you when you'd rather not manage them.</p>
      </details>
      <details>
        <summary>Is there a comparison vs SQL Developer / DBeaver?</summary>
        <p>Yes — see the table above. Short version: modern UI, built-in AI (BYOK), Apache 2.0, full Oracle 9i→26ai range. The other tools each miss at least one of those.</p>
      </details>
      <details>
        <summary>How do I get notified when Cloud launches?</summary>
        <p><a href="#waitlist">Join the waitlist above</a> — early members shape the roadmap and get founder pricing at launch.</p>
      </details>
    </div>
  </div>
</section>
</ScrollReveal>

<ScrollReveal>
<section class="proof">
  <div class="container proof-inner">
    <h2>Open-source core. Optional managed intelligence.</h2>
    <p class="lead">
      The Community IDE is fully open-source under Apache 2.0.
      Veesker Cloud is an optional managed intelligence layer for advanced AI and collaborative workflows.
    </p>
    <div class="cta">
      <a href="/download" class="btn primary">Download Community</a>
      <a href="#waitlist" class="btn cloud">Join Cloud waitlist →</a>
      <a href="https://github.com/veesker-cloud/veesker-community-edition" class="btn" target="_blank" rel="noopener">View Source</a>
    </div>
  </div>
</section>
</ScrollReveal>

<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Ensure all sections sit above the fixed PipelineSpine (z-index: 0) */
  section {
    position: relative;
    z-index: 1;
  }

  .hero {
    padding: 96px 0 64px;
    text-align: center;
    position: relative;
    overflow: hidden;
    background: rgba(10, 8, 6, 0.95);
  }
  .hero-logo-wrap {
    display: block;
  }
  .hero-logo {
    width: min(300px, 72vw);
    height: auto;
    object-fit: cover;
    margin: 0 auto -18px;
    display: block;
    filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.42));
  }
  .badge {
    display: inline-block;
    padding: 6px 15px;
    border-radius: 100px;
    background: rgba(14, 13, 12, 0.8);
    border: 1px solid rgba(245, 241, 232, 0.18);
    color: rgba(245, 241, 232, 0.92);
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    margin-bottom: 14px;
  }
  h1 {
    font-size: 56px;
    line-height: 1.05;
    letter-spacing: -0.03em;
    margin: 0 0 18px;
  }
  .lead {
    font-size: 18px;
    line-height: 1.6;
    color: var(--text-muted);
    max-width: 780px;
    margin: 0 auto 24px;
  }
  .hero-signals {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
    border-radius: 14px;
    border: 1px solid rgba(245, 241, 232, 0.14);
    background: linear-gradient(180deg, rgba(14, 13, 11, 0.86), rgba(10, 10, 10, 0.9));
    margin: 0 auto 22px;
    max-width: 720px;
  }
  .hero-signal {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(245, 241, 232, 0.18);
    border-radius: 10px;
    padding: 10px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(245, 241, 232, 0.92);
    background: rgba(17, 16, 14, 0.9);
  }
  .hero-signal::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(249, 115, 22, 0.85);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.14);
  }
  .hero-signal:nth-child(3)::before,
  .hero-signal:nth-child(4)::before {
    background: rgba(138, 216, 251, 0.9);
    box-shadow: 0 0 0 3px rgba(138, 216, 251, 0.16);
  }
  .cta {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .cta-btn {
    gap: 10px;
    padding-left: 12px;
  }
  .cta-icon-wrap {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(16, 15, 13, 0.78);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .cta-btn.primary .cta-icon-wrap {
    border-color: rgba(253, 186, 116, 0.6);
    background: rgba(140, 60, 5, 0.45);
  }
  .cta-btn.cloud .cta-icon-wrap {
    border-color: rgba(176, 234, 255, 0.62);
    background: rgba(20, 90, 121, 0.55);
  }
  .cta-icon {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ce-icon {
    object-position: center 50%;
  }
  .cloud-icon {
    object-position: center 32%;
  }

  .social-proof {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 26px;
  }
  .proof-badge {
    display: inline-flex;
    line-height: 0;
    border-radius: 6px;
    overflow: hidden;
    transition: transform 0.14s ease;
  }
  .proof-badge:hover {
    transform: translateY(-1px);
  }
  .proof-badge img {
    height: 22px;
    display: block;
  }

  .screenshot-showcase {
    padding: 60px 0;
    background: linear-gradient(180deg, rgba(10, 8, 6, 0.95), rgba(14, 12, 10, 0.92));
  }
  .screenshot-wrap {
    margin: 0 auto;
    max-width: 1180px;
    padding: 0 8px;
    text-align: center;
  }
  .screenshot {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 14px;
    border: 1px solid rgba(245, 241, 232, 0.12);
    box-shadow:
      0 40px 90px -30px rgba(0, 0, 0, 0.7),
      0 18px 40px -14px rgba(140, 60, 5, 0.25);
  }
  .screenshot-wrap figcaption {
    margin: 16px auto 0;
    max-width: 720px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-muted);
  }

  .features {
    padding: 80px 0;
  }
  .features h2 {
    text-align: center;
    font-size: 34px;
    max-width: 860px;
    margin: 0 auto 38px;
  }
  .feat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  :global(.feat-inner) {
    height: 100%;
    padding: 24px;
    border-radius: 12px;
    flex: 1;
  }
  .feat-icon {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(249, 115, 22, 0.12);
    border: 1px solid rgba(249, 115, 22, 0.32);
    color: #fdba74;
    margin-bottom: 14px;
  }
  .feat-icon svg {
    width: 20px;
    height: 20px;
  }
  .feat-inner h3 {
    font-size: 18px;
    margin: 0 0 10px;
  }
  .feat-inner p {
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.6;
    margin: 0;
  }

  .personas {
    padding: 0 0 80px;
  }
  .personas h2 {
    text-align: center;
    font-size: 32px;
    margin: 0 0 10px;
  }
  .personas-lead {
    text-align: center;
    color: var(--text-muted);
    font-size: 15px;
    margin: 0 auto 34px;
    max-width: 600px;
  }
  .persona-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }
  .persona {
    background: linear-gradient(170deg, rgba(28, 24, 20, 0.92), rgba(20, 18, 15, 0.94));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
  }
  .persona h3 {
    font-size: 17px;
    margin: 0 0 10px;
    color: #fdba74;
  }
  .persona p {
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.65;
    margin: 0;
  }

  .platform {
    padding: 0 0 82px;
  }
  .platform h2 {
    text-align: center;
    font-size: 34px;
    margin-bottom: 12px;
  }
  .platform-lead {
    text-align: center;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1.6;
    max-width: 700px;
    margin: 0 auto 34px;
  }
  .layer-focus-note {
    text-align: center;
    margin: 0 auto 18px;
    color: rgba(245, 241, 232, 0.78);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .layer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    align-items: stretch;
  }
  .layer-card {
    border-radius: 14px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    border: 1px solid var(--border);
    transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
  }
  .layer-card.community {
    background: linear-gradient(160deg, rgba(196, 92, 8, 0.12), rgba(196, 92, 8, 0.03));
    border-color: rgba(249, 115, 22, 0.25);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .layer-card.cloud {
    background:
      radial-gradient(120% 100% at 10% 0%, rgba(43, 180, 238, 0.2), transparent 50%),
      linear-gradient(165deg, rgba(22, 29, 36, 0.96), rgba(16, 22, 29, 0.97));
    border-color: rgba(138, 216, 251, 0.34);
    box-shadow: 0 14px 36px rgba(13, 74, 100, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .layer-card.focused {
    transform: translateY(-4px);
  }
  .layer-card.community.focused {
    box-shadow: 0 18px 34px rgba(140, 60, 5, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }
  .layer-card.cloud.focused {
    box-shadow: 0 18px 38px rgba(11, 76, 104, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.11);
  }
  .layer-card.unfocused {
    opacity: 0.58;
    filter: saturate(0.75);
  }
  :global(.layer-magic) {
    display: flex;
    flex-direction: column;
  }
  :global(.layer-magic .magic-card-tilt),
  :global(.layer-magic .magic-card-content) {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  :global(.persona-wrap) {
    display: flex;
    flex-direction: column;
  }
  :global(.persona-wrap .magic-card-tilt),
  :global(.persona-wrap .magic-card-content) {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  :global(.feat) {
    display: flex;
    flex-direction: column;
    background: linear-gradient(170deg, rgba(33, 28, 22, 0.95), rgba(24, 20, 16, 0.95));
    border: 1px solid var(--border);
  }
  :global(.feat .magic-card-tilt),
  :global(.feat .magic-card-content) {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .layer-head {
    display: grid;
    grid-template-columns: 112px 1fr;
    gap: 14px;
    align-items: center;
  }
  .layer-art-wrap {
    display: block;
  }
  .layer-art {
    width: 112px;
    height: 86px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(8, 8, 8, 0.4);
  }
  .layer-card.community h3 {
    font-size: 24px;
    color: #fdba74;
    margin-bottom: 3px;
  }
  .layer-card.cloud h3 {
    font-size: 24px;
    color: #9ce2ff;
    margin-bottom: 3px;
  }
  .layer-head p {
    margin: 0;
    color: var(--text-muted);
    font-size: 13.5px;
  }
  .best-for {
    display: block;
    margin-top: 7px;
    font-size: 11px;
    color: rgba(245, 241, 232, 0.7);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .status {
    display: inline-flex;
    align-items: center;
    margin-top: 8px;
    padding: 3px 9px;
    border-radius: 100px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: #b9ebff;
    background: rgba(27, 158, 216, 0.2);
    border: 1px solid rgba(138, 216, 251, 0.45);
  }
  .layer-card ul {
    list-style: none;
    padding: 0;
    margin: 0;
    flex: 1;
  }
  .layer-card li {
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(245, 241, 232, 0.84);
    font-size: 14px;
  }
  .layer-card li:first-child {
    border-top: none;
  }
  .layer-card.community li::before {
    content: "+ ";
    color: var(--accent-text);
  }
  .layer-card.cloud li::before {
    content: "+ ";
    color: var(--cloud-text);
  }
  .layer-btn {
    width: 100%;
    justify-content: center;
  }

  .comparison {
    padding: 80px 0;
    background: linear-gradient(180deg, rgba(14, 12, 10, 0.95), rgba(10, 8, 6, 0.97));
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .comparison h2 {
    text-align: center;
    font-size: 32px;
    margin: 0 0 8px;
  }
  .comparison-lead {
    text-align: center;
    color: var(--text-muted);
    font-size: 15px;
    margin: 0 auto 32px;
    max-width: 640px;
  }
  .comparison-table-wrap {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.02);
  }
  .comparison-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
    min-width: 720px;
  }
  .comparison-table th,
  .comparison-table td {
    padding: 14px 16px;
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .comparison-table thead th {
    color: var(--text-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    background: rgba(0, 0, 0, 0.25);
  }
  .comparison-table th[scope="row"] {
    text-align: left;
    color: var(--text);
    font-weight: 500;
  }
  .comparison-table .us {
    background: rgba(249, 115, 22, 0.06);
    color: #fdba74;
    font-weight: 600;
  }
  .comparison-table thead .us {
    color: #fdba74;
    background: rgba(249, 115, 22, 0.12);
  }
  .comparison-table tbody tr:last-child th,
  .comparison-table tbody tr:last-child td {
    border-bottom: none;
  }
  .comparison-foot {
    margin: 14px 0 0;
    padding: 0 4px;
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
  }

  .table-row-spotlight {
    position: relative;
  }
  .table-row-spotlight::after {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      180px circle at var(--sx, 50%) var(--sy, 50%),
      rgba(249, 115, 22, 0.07),
      transparent
    );
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }
  .table-row-spotlight:hover::after {
    opacity: 1;
  }

  .security {
    padding: 78px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background:
      radial-gradient(100% 130% at 80% 0%, rgba(43, 180, 238, 0.12), transparent 58%),
      linear-gradient(180deg, rgba(22, 19, 15, 0.95), rgba(14, 12, 10, 0.97));
  }
  .security-inner {
    text-align: center;
  }
  .security h2 {
    font-size: 34px;
    margin-bottom: 14px;
  }
  .security-lead {
    max-width: 820px;
    margin: 0 auto 30px;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1.7;
  }
  .zones {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .zone {
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    padding: 20px;
    text-align: left;
    background: rgba(10, 10, 10, 0.32);
  }
  .zone h3 {
    font-size: 18px;
    margin-bottom: 12px;
  }
  .cloud-zone h3 {
    color: #9ce2ff;
  }
  .architecture-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 10px;
    align-items: center;
  }
  .node {
    border-radius: 10px;
    padding: 13px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid var(--border-strong);
    text-align: center;
  }
  .node.db {
    background: rgba(249, 115, 22, 0.08);
    color: #fdba74;
  }
  .node.desktop {
    background: rgba(245, 241, 232, 0.06);
    color: #f5f1e8;
  }
  .node.cloud {
    background: rgba(43, 180, 238, 0.12);
    border-color: rgba(138, 216, 251, 0.4);
    color: #a9e6ff;
  }
  .arrow {
    color: rgba(245, 241, 232, 0.65);
    font-family: "JetBrains Mono", monospace;
    font-size: 18px;
    white-space: nowrap;
  }
  .arrow.optional {
    color: #9cdfff;
    font-size: 13px;
  }
  .guarantees {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }
  .guarantees li {
    padding: 6px 0;
    font-size: 13px;
    color: rgba(245, 241, 232, 0.82);
  }
  .guarantees li::before {
    content: "· ";
    color: var(--cloud-text);
  }

  .waitlist {
    padding: 80px 0;
    background: linear-gradient(180deg, rgba(14, 12, 10, 0.95), rgba(20, 27, 34, 0.95));
  }
  .waitlist :global(.anim-border-wrap) {
    max-width: 880px;
    margin: 0 auto;
    box-shadow: 0 14px 38px rgba(11, 76, 104, 0.3);
  }
  .waitlist-card-inner {
    padding: 36px;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 32px;
    align-items: center;
  }
  .waitlist-eyebrow {
    display: inline-block;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ce2ff;
    margin-bottom: 12px;
  }
  .waitlist-copy h2 {
    font-size: 28px;
    margin: 0 0 12px;
    color: #cfeeff;
  }
  .waitlist-copy p {
    color: var(--text-muted);
    font-size: 14.5px;
    line-height: 1.6;
    margin: 0;
  }
  .waitlist-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .waitlist-form input,
  .waitlist-form textarea {
    background: rgba(10, 14, 18, 0.7);
    border: 1px solid rgba(138, 216, 251, 0.3);
    border-radius: 8px;
    padding: 12px 14px;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    transition: border-color 0.14s ease;
  }
  .waitlist-form input:focus,
  .waitlist-form textarea:focus {
    outline: none;
    border-color: rgba(138, 216, 251, 0.7);
  }
  .waitlist-form textarea {
    resize: vertical;
    min-height: 72px;
  }
  .waitlist-btn {
    width: 100%;
    justify-content: center;
  }
  .waitlist-fineprint {
    font-size: 11.5px;
    color: var(--text-muted);
    margin: 4px 0 0;
    line-height: 1.5;
  }
  .waitlist-fineprint a {
    color: var(--accent-text);
  }
  .waitlist-error {
    font-size: 12.5px;
    color: #ff9f7a;
    margin: 4px 0 0;
    line-height: 1.5;
  }
  .waitlist-form input:disabled,
  .waitlist-form button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .waitlist-success {
    text-align: center;
    padding: 18px 0;
  }
  .success-icon {
    width: 52px;
    height: 52px;
    margin: 0 auto 14px;
    border-radius: 50%;
    background: rgba(76, 217, 100, 0.16);
    border: 1px solid rgba(76, 217, 100, 0.4);
    color: #74e88c;
    font-size: 26px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .waitlist-success h3 {
    font-size: 19px;
    margin: 0 0 8px;
    color: #cfeeff;
  }
  .waitlist-success p {
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.6;
    margin: 0;
  }

  .faq-home {
    padding: 80px 0;
  }
  .faq-home h2 {
    text-align: center;
    font-size: 32px;
    margin: 0 0 32px;
  }
  .faq-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    max-width: 980px;
    margin: 0 auto;
  }
  .faq-grid details {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    transition: border-color 0.14s ease;
  }
  .faq-grid details[open] {
    border-color: rgba(249, 115, 22, 0.4);
  }
  .faq-grid summary {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .faq-grid summary::after {
    content: "+";
    margin-left: auto;
    color: var(--accent-text);
    font-size: 18px;
    transition: transform 0.14s ease;
  }
  .faq-grid details[open] summary::after {
    content: "−";
  }
  .faq-grid summary::-webkit-details-marker {
    display: none;
  }
  .faq-grid p {
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.65;
    margin: 12px 0 0;
  }
  .faq-grid a {
    color: var(--accent-text);
  }

  .proof {
    padding: 80px 0;
    text-align: center;
  }
  .proof h2 {
    font-size: 34px;
    margin-bottom: 14px;
  }
  .proof .lead {
    max-width: 760px;
  }

  .vdb-showcase {
    padding: 72px 0;
    background:
      radial-gradient(110% 90% at 80% 0%, rgba(43, 180, 238, 0.18), transparent 56%),
      linear-gradient(170deg, rgba(20, 27, 34, 0.96), rgba(13, 18, 24, 0.98));
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    text-align: center;
  }
  .vdb-eyebrow {
    display: inline-block;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9ce2ff;
    background: rgba(43, 180, 238, 0.12);
    border: 1px solid rgba(138, 216, 251, 0.32);
    border-radius: 100px;
    padding: 5px 14px;
    margin-bottom: 18px;
  }
  .vdb-showcase h2 {
    font-size: 38px;
    letter-spacing: -0.02em;
    margin: 0 0 14px;
    background: linear-gradient(110deg, #f5f1e8 0%, #9ce2ff 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .vdb-lead {
    max-width: 780px;
    margin: 0 auto 44px;
    color: var(--text-muted);
    font-size: 17px;
    line-height: 1.65;
  }
  .vdb-diagram-wrap {
    max-width: 1180px;
    margin: 0 auto 48px;
    padding: 0 8px;
    display: block;
  }
  .vdb-diagram {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 16px;
    border: 1px solid rgba(138, 216, 251, 0.18);
    box-shadow:
      0 40px 90px -30px rgba(43, 180, 238, 0.35),
      0 18px 40px -16px rgba(0, 0, 0, 0.55);
  }
  .vdb-diagram-caption {
    margin: 18px auto 0;
    max-width: 820px;
    font-size: 13.5px;
    line-height: 1.6;
    color: rgba(245, 241, 232, 0.62);
    text-align: center;
  }
  .vdb-step {
    border-radius: 11px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    height: 100%;
    box-sizing: border-box;
  }
  .vdb-step-num {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: rgba(156, 226, 255, 0.7);
    margin-bottom: 4px;
  }
  .vdb-step h3 {
    font-size: 18px;
    margin: 0;
    color: #cfeeff;
  }
  .vdb-step p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: rgba(245, 241, 232, 0.78);
  }
  .vdb-meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
  }
  .vdb-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #b9ebff;
    background: rgba(27, 158, 216, 0.18);
    border: 1px solid rgba(138, 216, 251, 0.4);
  }
  .vdb-format {
    font-size: 12px;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
  .vdb-format code {
    font-family: "JetBrains Mono", monospace;
    background: rgba(245, 241, 232, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11.5px;
    color: rgba(245, 241, 232, 0.92);
  }
  .vdb-format a {
    color: #9ce2ff;
    text-decoration: none;
    border-bottom: 1px solid rgba(156, 226, 255, 0.4);
  }
  .vdb-format a:hover {
    border-bottom-color: #9ce2ff;
  }

  @media (max-width: 980px) {
    h1 {
      font-size: 44px;
    }
    .hero-signals {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .feat-grid,
    .persona-grid,
    .layer-grid,
    .zones,
    .faq-grid {
      grid-template-columns: 1fr;
    }
    .layer-head {
      grid-template-columns: 90px 1fr;
    }
    .layer-art {
      width: 90px;
      height: 70px;
    }
    .architecture-row {
      grid-template-columns: 1fr;
    }
    .arrow {
      text-align: center;
    }
    .vdb-showcase h2 {
      font-size: 30px;
    }
    .waitlist-card-inner {
      grid-template-columns: 1fr;
      padding: 28px;
      gap: 24px;
    }
  }

  @media (max-width: 600px) {
    .hero {
      padding-top: 82px;
    }
    h1 {
      font-size: 36px;
    }
    .lead {
      font-size: 16px;
    }
    .hero-logo {
      width: min(250px, 78vw);
      margin-bottom: -10px;
    }
    .hero-signal {
      font-size: 11px;
    }
    .features h2,
    .platform h2,
    .security h2,
    .proof h2,
    .comparison h2,
    .personas h2,
    .faq-home h2 {
      font-size: 28px;
    }
  }
</style>
