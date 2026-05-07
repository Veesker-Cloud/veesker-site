<script lang="ts">
  import Seo from "$lib/seo.svelte";
  import ScrollReveal from "$lib/components/ScrollReveal.svelte";
</script>

<Seo
  title="Editorial Process"
  description="How the Veesker blog is produced. AI-drafted, human-reviewed, published only after explicit team approval."
  path="/editorial"
  image="/datamap-hero.png"
  imageAlt="Veesker editorial process diagram"
/>

<ScrollReveal>
  <section class="hero">
    <div class="container">
      <div class="eyebrow">Editorial process</div>
      <h1>How we produce this content.</h1>
      <p class="lead">
        The Veesker blog runs on a deliberate workflow that combines AI drafting with
        human editorial oversight. Here is exactly how it works — no marketing spin.
      </p>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="pipeline">
    <div class="container narrow">
      <ol class="steps">
        <li>
          <div class="step-num">1</div>
          <div class="step-body">
            <h2>Topic selection <span class="who">— human</span></h2>
            <p>
              The Veesker team picks every topic. Pauta is shaped by our roadmap, recurring
              questions from customers and contributors, and themes from the wider Oracle and
              database ecosystem. No topics are auto-generated.
            </p>
          </div>
        </li>
        <li>
          <div class="step-num">2</div>
          <div class="step-body">
            <h2>Draft generation <span class="who">— AI</span></h2>
            <p>
              Each post is drafted by a Claude agent running on a scheduled job — typically
              Mondays (deep-dives) and Thursdays (manifestos). The agent works from a curated
              prompt, our editorial guidelines, and reference material we provide. Every draft
              ships in both English and Portuguese.
            </p>
          </div>
        </li>
        <li>
          <div class="step-num">3</div>
          <div class="step-body">
            <h2>Review and editing <span class="who">— human</span></h2>
            <p>
              Every draft is reviewed by the Veesker team before publication. We check for
              technical accuracy, factual claims, alignment with our positioning, tone, and
              voice. We edit, rewrite, or reject as needed. Drafts that do not meet the bar
              do not ship.
            </p>
          </div>
        </li>
        <li>
          <div class="step-num">4</div>
          <div class="step-body">
            <h2>Publication <span class="who">— human-approved</span></h2>
            <p>
              Posts go live only after explicit approval from the Veesker team. The byline on
              every post is <strong>Veesker</strong> — we take editorial responsibility for
              what we publish, regardless of how the first draft was produced.
            </p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="why">
    <div class="container narrow">
      <h2>Why we disclose this</h2>
      <ul>
        <li>
          <strong>It matches our brand.</strong> Veesker is an Oracle development platform for
          the AI agent era. Pretending humans wrote every word would be incongruent with the
          tools we build and the workflows we advocate for.
        </li>
        <li>
          <strong>It lets readers calibrate trust.</strong> Knowing how the sausage is made is
          more useful than a generic byline.
        </li>
        <li>
          <strong>The infrastructure is open.</strong> Our publishing pipeline lives in the
          Apache 2.0 source. Anyone can verify how posts move from draft to live.
        </li>
      </ul>
    </div>
  </section>
</ScrollReveal>

<ScrollReveal>
  <section class="report">
    <div class="container narrow">
      <h2>Spotted an error?</h2>
      <p>
        If you find a factual mistake, technical error, or unclear claim in any post, please
        open an issue on GitHub. We treat blog corrections the same way we treat code bugs —
        every report gets reviewed.
      </p>
      <p class="cta">
        <a href="https://github.com/Veesker-Cloud/veesker-community-edition/issues" target="_blank" rel="noopener">
          Open an issue on GitHub →
        </a>
      </p>
    </div>
  </section>
</ScrollReveal>

<style>
  .container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
  }
  .narrow {
    max-width: 760px;
  }

  .hero {
    padding: 80px 0 32px;
  }
  .eyebrow {
    font-family: "JetBrains Mono", monospace;
    font-size: 11.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-text);
    margin-bottom: 18px;
  }
  .hero h1 {
    font-size: 42px;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin: 0 0 16px;
  }
  .lead {
    color: var(--text-muted);
    font-size: 17px;
    line-height: 1.6;
    margin: 0;
    max-width: 760px;
  }

  .pipeline {
    padding: 32px 0 16px;
  }
  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .steps > li {
    display: flex;
    gap: 18px;
    padding: 22px 22px 22px 18px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-soft);
  }
  .step-num {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(249, 115, 22, 0.16);
    color: #fdba74;
    border: 1px solid rgba(249, 115, 22, 0.4);
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    font-weight: 700;
  }
  .step-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .step-body h2 {
    font-size: 19px;
    margin: 2px 0 8px;
    letter-spacing: -0.01em;
  }
  .who {
    font-family: "JetBrains Mono", monospace;
    font-weight: 400;
    font-size: 12.5px;
    color: var(--text-muted);
    letter-spacing: 0.02em;
  }
  .step-body p {
    color: var(--text);
    font-size: 15px;
    line-height: 1.7;
    margin: 0;
  }

  .why {
    padding: 32px 0 16px;
  }
  .why h2 {
    font-size: 24px;
    margin: 0 0 16px;
    letter-spacing: -0.01em;
  }
  .why ul {
    padding-left: 1.2rem;
    color: var(--text);
    font-size: 15px;
    line-height: 1.75;
    margin: 0;
  }
  .why li {
    margin-bottom: 10px;
  }
  .why strong {
    color: var(--text);
  }

  .report {
    padding: 32px 0 100px;
  }
  .report h2 {
    font-size: 24px;
    margin: 0 0 14px;
    letter-spacing: -0.01em;
  }
  .report p {
    color: var(--text);
    font-size: 15px;
    line-height: 1.7;
    margin: 0 0 14px;
  }
  .cta a {
    color: var(--accent-text);
    font-weight: 600;
    text-decoration: none;
  }
  .cta a:hover {
    text-decoration: underline;
  }

  @media (max-width: 720px) {
    .hero {
      padding: 60px 0 24px;
    }
    .hero h1 {
      font-size: 30px;
    }
    .steps > li {
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
