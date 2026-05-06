import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type Lenis from "lenis";

let initialized = false;

export function initGsap(lenis: Lenis): void {
  if (initialized) return;

  gsap.registerPlugin(ScrollTrigger);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  lenis.on("scroll", ScrollTrigger.update);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    gsap.globalTimeline.timeScale(100);
  }

  gsap.defaults({ ease: "power2.out", duration: 0.7 });

  initialized = true;
}

export function killGsap(lenis: Lenis): void {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  lenis.off("scroll", ScrollTrigger.update);
  initialized = false;
}
