<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    as = "h1",
    duration = "2.5s",
    shimmerColor = "#fdba74",
    class: className = "",
    children,
    ...restProps
  }: {
    as?: string;
    duration?: string;
    shimmerColor?: string;
    class?: string;
    children: Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<svelte:element
  this={as}
  class="shimmer-text {className}"
  style="--shimmer-color:{shimmerColor};--shimmer-dur:{duration};"
  {...restProps}
>
  {@render children()}
</svelte:element>

<style>
  .shimmer-text {
    background: linear-gradient(
      90deg,
      rgba(245, 241, 232, 0.35) 0%,
      rgba(245, 241, 232, 0.92) 25%,
      var(--shimmer-color) 50%,
      rgba(245, 241, 232, 0.92) 75%,
      rgba(245, 241, 232, 0.35) 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: shimmer var(--shimmer-dur) linear infinite;
    display: block;
    width: fit-content;
    max-width: 100%;
    margin-left: auto;
    margin-right: auto;
  }
  @keyframes shimmer {
    from {
      background-position: 200% center;
    }
    to {
      background-position: -200% center;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .shimmer-text {
      animation: none;
      background: none;
      color: var(--text);
    }
  }
</style>
