<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let { sql }: { sql: string } = $props();

  let el: HTMLDivElement;
  let trigger: { kill: () => void } | undefined;
  let typed = $state("");
  let done = $state(false);

  // Tokenize: keywords get .kw, columns/identifiers .col, strings .str
  const KEYWORDS = new Set([
    "SELECT", "FROM", "WHERE", "GROUP", "BY", "BEGIN", "END", "INSERT",
    "INTO", "VALUES", "AND", "OR", "ORDER", "LIMIT", "COUNT",
  ]);

  function tokenize(s: string): string {
    return s
      .split(/(\s+|[(),;]|'[^']*')/g)
      .map((t) => {
        if (!t) return "";
        if (/^'/.test(t)) return `<span class="str">${escapeHtml(t)}</span>`;
        const upper = t.trim().toUpperCase();
        if (KEYWORDS.has(upper)) return `<span class="kw">${escapeHtml(t)}</span>`;
        if (/^[a-z_][a-z0-9_]*$/i.test(t.trim())) return `<span class="col">${escapeHtml(t)}</span>`;
        return escapeHtml(t);
      })
      .join("");
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  }

  onMount(async () => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      typed = sql;
      done = true;
      return;
    }

    const { gsap } = await import("gsap");
    const { ScrollTrigger } = await import("gsap/ScrollTrigger");
    gsap.registerPlugin(ScrollTrigger);

    trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        const obj = { i: 0 };
        gsap.to(obj, {
          i: sql.length,
          duration: Math.min(2.4, sql.length * 0.035),
          ease: "none",
          onUpdate: () => {
            typed = sql.slice(0, Math.floor(obj.i));
          },
          onComplete: () => {
            typed = sql;
            done = true;
          },
        });
      },
    });
  });

  onDestroy(() => trigger?.kill());
</script>

<div class="sql-divider" bind:this={el} aria-hidden="true">
  <div class="hairline top"></div>
  <!-- sql prop is developer-controlled constant; escapeHtml guards & < > -->
  <code class="sql"><span>{@html tokenize(typed)}</span><span class="cursor" class:done></span></code>
  <div class="hairline bottom"></div>
</div>

<style>
  .sql-divider {
    position: relative;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    padding: 0 16px;
    overflow: hidden;
  }
  .hairline {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      rgba(138, 216, 251, 0.18) 8%,
      rgba(138, 216, 251, 0.4) 50%,
      rgba(138, 216, 251, 0.18) 92%,
      transparent
    );
  }
  .top    { top: 0; }
  .bottom { bottom: 0; }
  .sql {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 13px;
    color: rgba(245, 241, 232, 0.7);
    background: rgba(8, 6, 4, 0.92);
    padding: 0 18px;
    z-index: 2;
    white-space: nowrap;
    max-width: calc(100% - 32px);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sql :global(.kw)  { color: #fdba74; font-weight: 600; }
  .sql :global(.col) { color: #9ce2ff; }
  .sql :global(.str) { color: rgba(245, 241, 232, 0.85); }
  .cursor {
    display: inline-block;
    width: 7px;
    margin-left: 2px;
    color: rgba(253, 186, 116, 0.9);
    animation: cursor-blink 1s steps(2) infinite;
  }
  .cursor::before { content: "▍"; }
  .cursor.done { animation-iteration-count: 0; opacity: 0.7; }
  @keyframes cursor-blink {
    50% { opacity: 0; }
  }
  @media (max-width: 767px) {
    .sql-divider { height: 48px; }
    .sql { font-size: 11px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cursor { animation: none; opacity: 0.7; }
  }
</style>
