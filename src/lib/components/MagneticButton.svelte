<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  let {
    strength = 0.35,
    radius = 80,
    class: className = "",
    children,
  }: {
    strength?: number;
    radius?: number;
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
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "elastic.out(1, 0.4)" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "elastic.out(1, 0.4)" });

        const move = (e: MouseEvent) => {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < rect.width / 2 + radius) {
            xTo(dx * strength);
            yTo(dy * strength);
          } else {
            xTo(0); yTo(0);
          }
        };
        const reset = () => { xTo(0); yTo(0); };

        window.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", reset);
        cleanup = () => {
          window.removeEventListener("mousemove", move);
          el.removeEventListener("mouseleave", reset);
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

<div bind:this={el} class="magnetic {className}">
  {@render children()}
</div>

<style>
  .magnetic {
    display: inline-flex;
    will-change: transform;
  }
</style>
