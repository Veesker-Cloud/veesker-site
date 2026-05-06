import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";

let initialized = false;
let tickerCb: ((time: number) => void) | null = null;

export function initGsap(lenis: Lenis): void {
  if (initialized) return;

  gsap.registerPlugin(ScrollTrigger);

  tickerCb = (time) => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(tickerCb);
  gsap.ticker.lagSmoothing(0);

  lenis.on("scroll", ScrollTrigger.update);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    gsap.globalTimeline.timeScale(100);
  }

  gsap.defaults({ ease: "power2.out", duration: 0.7 });

  // Refresh ScrollTrigger positions after layout settles. Two RAFs ensure
  // we're past Svelte's mount cycle + browser paint, then a final refresh
  // when all images finish loading (image dimensions shift trigger points).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  });

  if (typeof window !== "undefined" && document.readyState !== "complete") {
    window.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
  }

  initialized = true;
}

export function killGsap(lenis: Lenis): void {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  lenis.off("scroll", ScrollTrigger.update);
  if (tickerCb) {
    gsap.ticker.remove(tickerCb);
    tickerCb = null;
  }
  initialized = false;
}
