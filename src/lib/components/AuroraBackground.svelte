<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let {
    speed = 1.0,
    intensity = 0.28,
  }: {
    speed?: number;
    intensity?: number;
  } = $props();

  let el: HTMLDivElement;
  let tl: { kill: () => void } | undefined;

  onMount(async () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    try {
      const { gsap } = await import("gsap");

      tl = gsap.timeline({ repeat: -1, yoyo: true });
      const dur = 6 / speed;

      tl.to(el, { scale: 1.06, rotation: 1.2, duration: dur, ease: "sine.inOut" })
        .to(el, { scale: 1.02, rotation: -0.8, duration: dur * 0.8, ease: "sine.inOut" });
    } catch {
      // GSAP failed to load — CSS fallback animation will run
      el?.classList.add("aurora-bg-css");
    }
  });

  onDestroy(() => tl?.kill());
</script>

<div
  class="aurora-bg aurora-bg-css"
  bind:this={el}
  style="--intensity:{intensity};--aurora-dur:{12 / speed}s"
  aria-hidden="true"
></div>

<style>
  .aurora-bg {
    position: absolute;
    inset: -20%;
    z-index: 0;
    background:
      radial-gradient(
        ellipse 120% 60% at 22% 50%,
        rgba(249, 115, 22, var(--intensity)),
        transparent 55%
      ),
      radial-gradient(
        ellipse 100% 70% at 78% 30%,
        rgba(138, 216, 251, calc(var(--intensity) * 0.85)),
        transparent 55%
      ),
      radial-gradient(
        ellipse 80% 80% at 50% 92%,
        rgba(196, 92, 8, calc(var(--intensity) * 0.65)),
        transparent 60%
      );
    pointer-events: none;
    will-change: transform;
  }

  /* CSS-driven fallback animation — runs when GSAP is unavailable
     or until GSAP takes over. Once GSAP starts manipulating the
     element's transform, the inline style overrides the animation. */
  .aurora-bg-css {
    animation: aurora-drift var(--aurora-dur, 12s) ease-in-out infinite alternate;
  }

  @keyframes aurora-drift {
    0% {
      transform: scale(1) rotate(0deg);
    }
    50% {
      transform: scale(1.06) rotate(1.2deg);
    }
    100% {
      transform: scale(1.02) rotate(-0.8deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aurora-bg-css {
      animation: none;
    }
  }
</style>
