<script lang="ts">
  import Seo from "$lib/seo.svelte";
  import ScrollReveal from "$lib/components/ScrollReveal.svelte";
</script>

<Seo
  title="Security & Trust"
  description="How Veesker protects your database and your data. No auto-commit, OS keychain credentials, local audit trail, and transparent AI boundaries — all verifiable in open source."
  path="/security"
  image="/datamap-hero.png"
  imageAlt="Veesker security architecture — Desktop Client to Oracle, with local audit and OS keychain"
/>

<ScrollReveal>
  <section class="hero">
    <div class="container">
      <div class="eyebrow">Security &amp; Trust</div>
      <h1>How Veesker protects your data.</h1>
      <p class="lead">
        No auto-commit. No background execution. No plaintext credentials.
        Every claim on this page is verifiable in the Apache 2.0 source.
      </p>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="pillars">
    <div class="container">
      <div class="pillar-grid">

        <article class="pillar">
          <div class="pillar-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h2>Execution safety</h2>
          <ul>
            <li><strong>User-initiated only.</strong> Every SQL statement requires you to click Run or press the execute shortcut. Veesker never executes SQL in the background.</li>
            <li><strong>No auto-commit.</strong> <code>oracledb.autoCommit</code> is set to <code>false</code> globally and repeated on every execute call. Every transaction requires an explicit COMMIT or ROLLBACK.</li>
            <li><strong>No scheduled or timed queries.</strong> Veesker has no background jobs, cron logic, or deferred execution of any kind.</li>
            <li><strong>Unsafe-DML confirmations.</strong> Bare DELETE or UPDATE without a WHERE clause triggers a confirmation modal before reaching Oracle.</li>
          </ul>
        </article>

        <article class="pillar">
          <div class="pillar-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="10" width="16" height="11" rx="2"/>
              <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
            </svg>
          </div>
          <h2>Credential safety</h2>
          <ul>
            <li><strong>OS keychain only.</strong> Passwords are stored in Windows Credential Manager, macOS Keychain, or Linux libsecret — never in SQLite, log files, or audit files.</li>
            <li><strong>Local IPC only.</strong> Credentials travel only over a localhost stdin/stdout pipe (the Tauri IPC channel) to open Oracle sessions. They never leave your machine.</li>
            <li><strong>Cloud Edition AI never receives passwords.</strong> The Sheep assistant receives schema metadata and SQL — never connection strings or wallet files.</li>
          </ul>
        </article>

        <article class="pillar">
          <div class="pillar-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <h2>Audit trail</h2>
          <ul>
            <li><strong>Every executed statement is logged.</strong> Entries go to <code>&lt;app_data&gt;/audit/YYYY-MM-DD.jsonl</code> and include timestamp, host, username, SQL, success/failure, row count, and elapsed time.</li>
            <li><strong>Written by the native host, not the renderer.</strong> The audit write happens in the Rust layer (<code>src-tauri/src/commands.rs → write_audit_entry()</code>). A compromised WebView renderer cannot suppress it.</li>
            <li><strong>You own your data.</strong> Audit files stay on your filesystem. Veesker never ships them to a remote server in Community Edition.</li>
          </ul>
        </article>

        <article class="pillar">
          <div class="pillar-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2 4 6v6c0 4.4 3.4 8.5 8 10 4.6-1.5 8-5.6 8-10V6z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h2>Per-connection safety guards</h2>
          <ul>
            <li><strong>Read-only mode</strong> — the sidecar (<code>sidecar/src/oracle.ts → enforceSafetyForStatement()</code>) rejects any non-SELECT before it reaches Oracle. This guard is server-side; the UI layer cannot bypass it.</li>
            <li><strong>Environment tagging</strong> — dev / staging / prod labels drive UI affordances and confirm gates.</li>
            <li><strong>Statement timeouts</strong> — per-connection cap prevents runaway queries from locking your database.</li>
          </ul>
        </article>

      </div>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="ai-zone" aria-labelledby="ai-zone-title">
    <div class="container">
      <h2 id="ai-zone-title">AI transparency — what Sheep sends to Anthropic.</h2>
      <p class="zone-lead">
        The Sheep AI assistant suggests SQL and explains results. It never executes anything autonomously.
        An explicit disclosure modal is shown before AI can be used on any connection.
      </p>
      <div class="zone-grid">
        <div class="zone-card zone-card--sends">
          <h3>What Sheep sends to <code>api.anthropic.com</code></h3>
          <ul>
            <li>Schema names, table names, column names</li>
            <li>SQL you write and submit for analysis</li>
            <li>Query result samples (up to 50 rows by default)</li>
            <li>Oracle database version string</li>
          </ul>
        </div>
        <div class="zone-card zone-card--never">
          <h3>What Sheep never sends</h3>
          <ul>
            <li>Passwords or connection strings</li>
            <li>Wallet files or certificate data</li>
            <li>Full table dumps or bulk data exports</li>
            <li>Data from schemas marked as sensitive (Cloud Edition)</li>
          </ul>
        </div>
      </div>
      <p class="zone-note">
        AI calls on production-tagged connections require per-session acknowledgement enforced in the sidecar — not just a UI prompt.
      </p>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="open-source">
    <div class="container">
      <div class="os-inner">
        <div class="os-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56v-1.99c-3.2.69-3.88-1.36-3.88-1.36-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.72-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 5.72 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.58.23 2.75.11 3.04.73.8 1.18 1.82 1.18 3.07 0 4.42-2.7 5.39-5.27 5.67.41.35.78 1.05.78 2.11v3.13c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>
          </svg>
        </div>
        <div class="os-text">
          <h2>Apache 2.0 — audit the code yourself.</h2>
          <p>
            All safety-critical code is in the open-source Community Edition repository.
            You can read, audit, and compile every line that touches your Oracle database.
          </p>
          <div class="os-files">
            <div class="os-file"><code>sidecar/src/oracle.ts</code> — all Oracle operations, safety guards, auto-commit enforcement</div>
            <div class="os-file"><code>sidecar/src/sql-kind.ts</code> — SQL classification and unsafe DML detection</div>
            <div class="os-file"><code>sidecar/src/ai.ts</code> — AI integration, what data is sent, production gate</div>
            <div class="os-file"><code>src-tauri/src/commands.rs</code> — audit logging, credential handling, SSRF protections</div>
          </div>
          <div class="os-cta">
            <a href="https://github.com/veesker-cloud/veesker-community-edition" target="_blank" rel="noopener" class="btn">View source on GitHub</a>
            <a href="https://github.com/veesker-cloud/veesker-community-edition/blob/main/SECURITY.md" target="_blank" rel="noopener" class="btn secondary">Read SECURITY.md</a>
          </div>
        </div>
      </div>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="disclosure">
    <div class="container disclosure-inner">
      <h2>Responsible disclosure</h2>
      <p class="disclosure-lead">
        Found a vulnerability? Report it privately — we treat security reports as priority work.
      </p>
      <div class="disclosure-grid">
        <div>
          <h3>How to report</h3>
          <ul>
            <li>Email <a href="mailto:security@veesker.cloud"><code>security@veesker.cloud</code></a> with a description, reproduction steps, and impact assessment.</li>
            <li>Or open a <a href="https://github.com/veesker-cloud/veesker-community-edition/security/advisories/new" target="_blank" rel="noopener">GitHub private security advisory</a>.</li>
            <li>Do not open public GitHub issues for security vulnerabilities.</li>
          </ul>
        </div>
        <div>
          <h3>Our commitment</h3>
          <ul>
            <li>Acknowledgement within <strong>72 hours</strong>.</li>
            <li>Fix timeline within <strong>7 days</strong> for critical issues.</li>
            <li>Credit in release notes (or anonymous if you prefer).</li>
            <li>No legal action against good-faith research.</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</ScrollReveal>

<style>
  .hero {
    padding: 80px 0 50px;
    text-align: center;
  }
  .eyebrow {
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

  .pillars {
    padding: 30px 0 60px;
  }
  .pillar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    max-width: 1080px;
    margin: 0 auto;
  }
  .pillar {
    background: linear-gradient(170deg, rgba(28, 24, 20, 0.92), rgba(20, 18, 15, 0.94));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
  }
  .pillar-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(249, 115, 22, 0.12);
    border: 1px solid rgba(249, 115, 22, 0.32);
    color: #fdba74;
    margin-bottom: 16px;
  }
  .pillar-icon svg {
    width: 22px;
    height: 22px;
  }
  .pillar h2 {
    font-size: 21px;
    margin: 0 0 14px;
  }
  .pillar ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .pillar li {
    padding: 8px 0;
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.6;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .pillar li:first-child {
    border-top: none;
  }
  .pillar li strong {
    color: var(--text);
  }
  .pillar code {
    font-family: "JetBrains Mono", monospace;
    background: rgba(245, 241, 232, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
  }

  .ai-zone {
    padding: 60px 0;
    background:
      radial-gradient(110% 90% at 80% 0%, rgba(43, 180, 238, 0.16), transparent 56%),
      linear-gradient(170deg, rgba(20, 27, 34, 0.96), rgba(13, 18, 24, 0.98));
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .ai-zone h2 {
    text-align: center;
    font-size: 30px;
    margin: 0 0 10px;
    color: #cfeeff;
  }
  .zone-lead {
    text-align: center;
    color: var(--text-muted);
    font-size: 15px;
    max-width: 640px;
    margin: 0 auto 28px;
    line-height: 1.6;
  }
  .zone-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    max-width: 920px;
    margin: 0 auto;
  }
  .zone-card {
    border-radius: 10px;
    padding: 20px 22px;
  }
  .zone-card--sends {
    background: linear-gradient(170deg, rgba(28, 38, 48, 0.94), rgba(18, 26, 34, 0.95));
    border: 1px solid rgba(138, 216, 251, 0.28);
  }
  .zone-card--never {
    background: linear-gradient(170deg, rgba(28, 20, 20, 0.94), rgba(20, 14, 14, 0.95));
    border: 1px solid rgba(249, 115, 22, 0.24);
  }
  .zone-card h3 {
    font-size: 14px;
    margin: 0 0 12px;
    color: #cfeeff;
    font-weight: 600;
  }
  .zone-card--never h3 {
    color: #fdba74;
  }
  .zone-card ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .zone-card li {
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.6;
    padding: 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .zone-card li:first-child {
    border-top: none;
  }
  .zone-card code {
    font-family: "JetBrains Mono", monospace;
    background: rgba(245, 241, 232, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
  }
  .zone-note {
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    margin: 20px auto 0;
    max-width: 640px;
    line-height: 1.6;
  }

  .open-source {
    padding: 60px 0;
  }
  .os-inner {
    max-width: 920px;
    margin: 0 auto;
    display: flex;
    gap: 32px;
    align-items: flex-start;
  }
  .os-icon {
    flex: 0 0 auto;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(245, 241, 232, 0.08);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .os-icon svg {
    width: 26px;
    height: 26px;
  }
  .os-text {
    flex: 1;
  }
  .os-text h2 {
    font-size: 26px;
    margin: 0 0 10px;
    letter-spacing: -0.01em;
  }
  .os-text > p {
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1.65;
    margin: 0 0 20px;
  }
  .os-files {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 24px;
  }
  .os-file {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
  }
  .os-file code {
    font-family: "JetBrains Mono", monospace;
    background: rgba(245, 241, 232, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text);
  }
  .os-cta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }
  .btn.secondary:hover {
    border-color: var(--text-muted);
    color: var(--text);
    text-decoration: none;
  }

  .disclosure {
    padding: 60px 0 80px;
    border-top: 1px solid var(--border);
    background: var(--bg-soft);
  }
  .disclosure-inner {
    max-width: 920px;
  }
  .disclosure h2 {
    font-size: 30px;
    margin: 0 0 10px;
    text-align: center;
  }
  .disclosure-lead {
    color: var(--text-muted);
    font-size: 15px;
    text-align: center;
    margin: 0 auto 32px;
    max-width: 640px;
    line-height: 1.6;
  }
  .disclosure-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .disclosure-grid > div {
    background: var(--bg-page, #0e0c0a);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 22px;
  }
  .disclosure-grid h3 {
    font-size: 17px;
    margin: 0 0 12px;
  }
  .disclosure-grid ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .disclosure-grid li {
    padding: 8px 0;
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.6;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .disclosure-grid li:first-child {
    border-top: none;
  }
  .disclosure-grid li strong {
    color: var(--text);
  }
  .disclosure-grid code {
    font-family: "JetBrains Mono", monospace;
    background: rgba(245, 241, 232, 0.08);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
  }
  .disclosure-grid a {
    color: var(--accent-text);
  }

  @media (max-width: 820px) {
    h1 {
      font-size: 36px;
    }
    .pillar-grid,
    .zone-grid,
    .disclosure-grid {
      grid-template-columns: 1fr;
    }
    .os-inner {
      flex-direction: column;
    }
  }
</style>
