<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { Snippet } from "svelte";

  let {
    y = 40,
    duration = 0.7,
    stagger = 0,
    delay = 0,
    clipReveal = false,
    children,
  }: {
    y?: number;
    duration?: number;
    stagger?: number;
    delay?: number;
    clipReveal?: boolean;
    children: Snippet;
  } = $props();

  let el: HTMLDivElement;
  let trigger: { kill: () => void } | undefined;

  onMount(async () => {
    const { gsap } = await import("gsap");
    const { ScrollTrigger } = await import("gsap/ScrollTrigger");

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const d = prefersReduced ? 0 : duration;
    const s = prefersReduced ? 0 : stagger;
    const targets = stagger > 0 ? Array.from(el.children) : [el];

    if (clipReveal) {
      gsap.set(targets, { clipPath: "inset(100% 0 0 0)", y: 14, opacity: 0 });
      trigger = ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () =>
          gsap.to(targets, {
            clipPath: "inset(0% 0 0 0)",
            y: 0,
            opacity: 1,
            duration: d,
            stagger: s,
            delay,
            ease: "power3.out",
          }),
      });
    } else {
      gsap.set(targets, { y: prefersReduced ? 0 : y, opacity: 0 });
      trigger = ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () =>
          gsap.to(targets, {
            y: 0,
            opacity: 1,
            duration: d,
            stagger: s,
            delay,
          }),
      });
    }
  });

  onDestroy(() => trigger?.kill());
</script>

<div bind:this={el}>
  {@render children()}
</div>
