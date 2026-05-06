<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    speed = "3s",
    borderRadius = "14px",
    padding = "1.5px",
    innerBg = "var(--bg-soft)",
    class: className = "",
    innerClass = "",
    children,
  }: {
    speed?: string;
    borderRadius?: string;
    padding?: string;
    innerBg?: string;
    class?: string;
    innerClass?: string;
    children: Snippet;
  } = $props();
</script>

<div
  class="anim-border-wrap {className}"
  style="--speed:{speed};--radius:{borderRadius};--pad:{padding};"
>
  <div class="anim-border-spin" aria-hidden="true"></div>
  <div
    class="anim-border-inner {innerClass}"
    style="background:{innerBg};border-radius:calc(var(--radius) - var(--pad));"
  >
    {@render children()}
  </div>
</div>

<style>
  .anim-border-wrap {
    position: relative;
    border-radius: var(--radius);
    padding: var(--pad);
    overflow: hidden;
    isolation: isolate;
    background: rgba(20, 17, 14, 0.6);
  }

  .anim-border-spin {
    position: absolute;
    inset: -100%;
    z-index: 0;
    pointer-events: none;
    background: conic-gradient(
      from 0deg,
      rgba(249, 115, 22, 0.85),
      rgba(138, 216, 251, 0.75),
      rgba(196, 92, 8, 0.65),
      rgba(249, 115, 22, 0.85)
    );
    animation: spin-border var(--speed) linear infinite;
  }

  @keyframes spin-border {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .anim-border-inner {
    position: relative;
    z-index: 1;
    height: 100%;
    width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .anim-border-spin {
      animation: none;
      background: linear-gradient(
        135deg,
        rgba(249, 115, 22, 0.6),
        rgba(138, 216, 251, 0.5),
        rgba(249, 115, 22, 0.6)
      );
    }
  }
</style>
