<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  let {
    maxTilt = 8,
    perspective = 900,
    glowColor = "rgba(249, 115, 22, 0.32)",
    accentColor = "rgba(249, 115, 22, 0.55)",
    secondaryColor = "rgba(138, 216, 251, 0.45)",
    borderRadius = "14px",
    animatedBorder = true,
    class: className = "",
    children,
  }: {
    maxTilt?: number;
    perspective?: number;
    glowColor?: string;
    accentColor?: string;
    secondaryColor?: string;
    borderRadius?: string;
    animatedBorder?: boolean;
    class?: string;
    children: Snippet;
  } = $props();

  let wrap: HTMLDivElement;
  let tilt: HTMLDivElement;
  let spot: HTMLDivElement;
  let isHovered = $state(false);

  onMount(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const { gsap } = await import("gsap");
      const ctx = gsap.context(() => {
        const xTo = gsap.quickTo(tilt, "rotationY", { duration: 0.45, ease: "power2.out" });
        const yTo = gsap.quickTo(tilt, "rotationX", { duration: 0.45, ease: "power2.out" });
        const zTo = gsap.quickTo(tilt, "z", { duration: 0.45, ease: "power2.out" });

        const move = (e: MouseEvent) => {
          const rect = wrap.getBoundingClientRect();
          const px = (e.clientX - rect.left) / rect.width;
          const py = (e.clientY - rect.top) / rect.height;
          xTo((px - 0.5) * 2 * maxTilt);
          yTo((py - 0.5) * 2 * -maxTilt);
          zTo(20);
          wrap.style.setProperty("--mx", `${px * 100}%`);
          wrap.style.setProperty("--my", `${py * 100}%`);
        };
        const enter = () => { isHovered = true; };
        const leave = () => {
          isHovered = false;
          xTo(0); yTo(0); zTo(0);
        };

        wrap.addEventListener("mousemove", move);
        wrap.addEventListener("mouseenter", enter);
        wrap.addEventListener("mouseleave", leave);

        cleanup = () => {
          wrap.removeEventListener("mousemove", move);
          wrap.removeEventListener("mouseenter", enter);
          wrap.removeEventListener("mouseleave", leave);
        };
      }, wrap);

      return () => {
        cleanup?.();
        ctx.revert();
      };
    })();

    return () => cleanup?.();
  });
</script>

<div
  class="magic-card {className}"
  class:has-border={animatedBorder}
  class:hovered={isHovered}
  bind:this={wrap}
  style="--perspective:{perspective}px;--radius:{borderRadius};--glow:{glowColor};--accent:{accentColor};--secondary:{secondaryColor};"
>
  {#if animatedBorder}
    <div class="magic-card-border" aria-hidden="true"></div>
  {/if}
  <div class="magic-card-tilt" bind:this={tilt}>
    <div class="magic-card-spot" bind:this={spot} aria-hidden="true"></div>
    <div class="magic-card-content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .magic-card {
    position: relative;
    border-radius: var(--radius);
    isolation: isolate;
    perspective: var(--perspective);
    --mx: 50%;
    --my: 50%;
  }
  .magic-card.has-border {
    padding: 1.5px;
    overflow: hidden;
  }
  .magic-card-border {
    position: absolute;
    inset: -100%;
    z-index: 0;
    pointer-events: none;
    background: conic-gradient(
      from 0deg,
      var(--accent),
      var(--secondary),
      rgba(196, 92, 8, 0.6),
      var(--accent)
    );
    animation: magic-spin 6s linear infinite;
    opacity: 0.55;
    transition: opacity 0.4s ease;
  }
  .magic-card.hovered .magic-card-border {
    opacity: 1;
  }
  @keyframes magic-spin {
    to { transform: rotate(360deg); }
  }
  .magic-card-tilt {
    position: relative;
    z-index: 1;
    border-radius: calc(var(--radius) - 1.5px);
    transform-style: preserve-3d;
    will-change: transform;
    height: 100%;
    width: 100%;
  }
  .magic-card-spot {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(
      circle 280px at var(--mx) var(--my),
      var(--glow),
      transparent 60%
    );
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .magic-card.hovered .magic-card-spot {
    opacity: 1;
  }
  .magic-card-content {
    position: relative;
    z-index: 1;
    border-radius: inherit;
    height: 100%;
    width: 100%;
    transform: translateZ(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .magic-card-border {
      animation: none;
      opacity: 0.4;
    }
    .magic-card-tilt {
      transform: none !important;
    }
  }
</style>
