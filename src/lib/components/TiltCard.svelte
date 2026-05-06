<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  let {
    maxTilt = 8,
    perspective = 800,
    class: className = "",
    children,
  }: {
    maxTilt?: number;
    perspective?: number;
    class?: string;
    children: Snippet;
  } = $props();

  let el: HTMLDivElement;

  onMount(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const { gsap } = await import("gsap");
      const ctx = gsap.context(() => {
        const xTo = gsap.quickTo(el, "rotationY", { duration: 0.4, ease: "power2.out" });
        const yTo = gsap.quickTo(el, "rotationX", { duration: 0.4, ease: "power2.out" });

        const move = (e: MouseEvent) => {
          const rect = el.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
          const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
          xTo(x * maxTilt);
          yTo(-y * maxTilt);
        };
        const leave = () => { xTo(0); yTo(0); };

        el.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", leave);
        cleanup = () => {
          el.removeEventListener("mousemove", move);
          el.removeEventListener("mouseleave", leave);
        };
      }, el);

      return () => {
        cleanup?.();
        ctx.revert();
      };
    })();

    return () => cleanup?.();
  });
</script>

<div
  bind:this={el}
  class="tilt-card {className}"
  style="--perspective:{perspective}px;"
>
  {@render children()}
</div>

<style>
  .tilt-card {
    transform-style: preserve-3d;
    perspective: var(--perspective);
    will-change: transform;
  }
  @media (prefers-reduced-motion: reduce) {
    .tilt-card {
      transform: none !important;
    }
  }
</style>
