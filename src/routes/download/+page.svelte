<script lang="ts">
  import Seo from "$lib/seo.svelte";
  import ShimmerText from "$lib/components/ShimmerText.svelte";
  import ScrollReveal from "$lib/components/ScrollReveal.svelte";

  const RELEASE = "0.5.0-beta.1";
  const BASE = `https://github.com/veesker-cloud/veesker-community-edition/releases/download/v${RELEASE}`;
  const RELEASE_URL = `https://github.com/veesker-cloud/veesker-community-edition/releases/tag/v${RELEASE}`;
</script>

<Seo
  title="Download"
  description="Download Veesker Community Edition for Windows, macOS, and Linux. Free and open source under Apache 2.0, with optional Veesker Cloud coming soon for managed intelligence."
  path="/download"
  image="/workspace-overview.png"
  imageAlt="Veesker workspace running on Windows, macOS, and Linux"
/>

<section class="hero">
  <div class="container">
    <ShimmerText as="h1">Download Veesker Community Edition</ShimmerText>
    <p class="lead">
      Community Edition · v{RELEASE} · free forever under Apache 2.0.
      Cloud is Coming Soon — H2 2026.
    </p>

    <ScrollReveal>
      <div class="downloads">
        <div class="dl">
          <div class="dl-os">Windows 10/11 · x64</div>
          <h3>Veesker_{RELEASE}_x64-setup.exe</h3>
          <p class="muted">NSIS installer — around 34 MB</p>
          <a href="{BASE}/Veesker_{RELEASE}_x64-setup.exe" class="btn primary" target="_blank" rel="noopener">Download for Windows</a>
          <p class="hint">SmartScreen may warn on first run. Click "More info" then "Run anyway".</p>
        </div>

        <div class="dl">
          <div class="dl-os">macOS · Apple Silicon</div>
          <h3>Veesker_{RELEASE}_aarch64.dmg</h3>
          <p class="muted">DMG for M1 / M2 / M3 / M4</p>
          <a href="{BASE}/Veesker_{RELEASE}_aarch64.dmg" class="btn primary" target="_blank" rel="noopener">Download for macOS (ARM)</a>
          <p class="hint">If Gatekeeper blocks first launch, right-click the app and choose Open.</p>
        </div>

        <div class="dl">
          <div class="dl-os">macOS · Intel</div>
          <h3>Veesker_{RELEASE}_x64.dmg</h3>
          <p class="muted">DMG for Intel Macs</p>
          <a href="{BASE}/Veesker_{RELEASE}_x64.dmg" class="btn primary" target="_blank" rel="noopener">Download for macOS (Intel)</a>
          <p class="hint">If Gatekeeper blocks first launch, right-click the app and choose Open.</p>
        </div>

        <div class="dl">
          <div class="dl-os">Linux · x64</div>
          <h3>Veesker_{RELEASE}_amd64.AppImage</h3>
          <p class="muted">AppImage — also available as .deb</p>
          <a href="{BASE}/Veesker_{RELEASE}_amd64.AppImage" class="btn primary" target="_blank" rel="noopener">Download AppImage</a>
          <p class="hint">Run <code>chmod +x</code> before launching. Need .deb? <a href="{RELEASE_URL}" target="_blank" rel="noopener">Get from release page</a>.</p>
        </div>
      </div>
    </ScrollReveal>

    <ScrollReveal>
      <div class="checksums">
        <h3>Verify your download (optional)</h3>
        <p class="muted">SHA-256 checksums and Ed25519 signatures are published with each release.</p>
        <pre class="cmd"># Windows (PowerShell)
Get-FileHash -Algorithm SHA256 .\Veesker_{RELEASE}_x64-setup.exe

# macOS / Linux
shasum -a 256 Veesker_{RELEASE}_aarch64.dmg</pre>
      </div>

      <div class="auto-update">
        <h3>Built-in auto-update</h3>
        <p>
          From v{RELEASE} onward, Veesker checks GitHub Releases on launch and offers in-app updates.
          Every release is signed with Ed25519 before installation.
        </p>
      </div>
    </ScrollReveal>
  </div>
</section>

<style>
  .hero {
    padding: 80px 0;
  }
  h1 {
    font-size: 44px;
    margin-bottom: 16px;
  }
  .lead {
    color: var(--text-muted);
    font-size: 16px;
    margin-bottom: 36px;
  }
  .downloads {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
    margin-bottom: 50px;
  }
  .dl {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px;
  }
  .dl-os {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 12px;
  }
  .dl h3 {
    font-size: 16px;
    margin: 0 0 6px;
    word-break: break-all;
  }
  .dl .muted {
    color: var(--text-muted);
    font-size: 13px;
    margin: 0 0 14px;
  }
  .dl .btn {
    width: 100%;
    justify-content: center;
    margin-bottom: 10px;
  }
  .dl .hint {
    color: var(--text-muted);
    font-size: 11.5px;
    margin: 0;
    line-height: 1.5;
  }
  .dl .hint a {
    color: var(--accent-text);
  }
  .dl .hint code {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    background: rgba(245, 241, 232, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .checksums,
  .auto-update {
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px;
    margin-bottom: 18px;
  }
  .checksums h3,
  .auto-update h3 {
    font-size: 16px;
    margin: 0 0 8px;
  }
  .checksums .muted,
  .auto-update p {
    color: var(--text-muted);
    font-size: 13.5px;
    line-height: 1.55;
    margin: 0 0 12px;
  }
  .cmd {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 12px;
    border-radius: 6px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--text);
    margin: 0;
    overflow-x: auto;
  }

  @media (max-width: 1100px) {
    .downloads {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 600px) {
    .downloads {
      grid-template-columns: 1fr;
    }
  }
</style>
