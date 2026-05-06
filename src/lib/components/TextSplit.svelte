<script lang="ts">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  let {
    as = "h1",
    delay = 0,
    duration = 0.8,
    stagger = 0.025,
    splitBy = "char",
    class: className = "",
    children,
    ...rest
  }: {
    as?: string;
    delay?: number;
    duration?: number;
    stagger?: number;
    splitBy?: "char" | "word";
    class?: string;
    children: Snippet;
    [k: string]: unknown;
  } = $props();

  let el: HTMLElement;

  onMount(() => {
    if (!el) return;

    const splitText = (root: HTMLElement) => {
      const walk = (node: Node): Node[] => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? "";
          const out: Node[] = [];
          if (splitBy === "char") {
            for (const ch of text) {
              const span = document.createElement("span");
              span.className = "ts-char";
              span.textContent = ch;
              if (ch === " ") span.classList.add("ts-space");
              out.push(span);
            }
          } else {
            for (const word of text.split(/(\s+)/)) {
              if (!word) continue;
              if (/^\s+$/.test(word)) {
                out.push(document.createTextNode(word));
              } else {
                const span = document.createElement("span");
                span.className = "ts-word";
                span.textContent = word;
                out.push(span);
              }
            }
          }
          return out;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          const elNode = node as Element;
          if (elNode.tagName === "BR") return [elNode.cloneNode(true)];
          const clone = elNode.cloneNode(false) as Element;
          for (const child of Array.from(elNode.childNodes)) {
            for (const replacement of walk(child)) {
              clone.appendChild(replacement);
            }
          }
          return [clone];
        }
        return [node.cloneNode(true)];
      };

      const replaced: Node[] = [];
      for (const child of Array.from(root.childNodes)) {
        for (const node of walk(child)) replaced.push(node);
      }
      root.replaceChildren(...replaced);
    };

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    splitText(el);

    if (prefersReduced) {
      el.querySelectorAll<HTMLElement>(".ts-char,.ts-word").forEach((n) => {
        n.style.opacity = "1";
        n.style.transform = "none";
      });
      return;
    }

    let cleanup: (() => void) | undefined;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      const ctx = gsap.context(() => {
        const targets = el.querySelectorAll(".ts-char, .ts-word");
        gsap.set(targets, { yPercent: 110, opacity: 0 });
        const trigger = ScrollTrigger.create({
          trigger: el,
          start: "top 85%",
          once: true,
          onEnter: () => {
            gsap.to(targets, {
              yPercent: 0,
              opacity: 1,
              duration,
              stagger,
              delay,
              ease: "power3.out",
            });
          },
        });
        cleanup = () => trigger.kill();
      }, el);
      return () => { cleanup?.(); ctx.revert(); };
    })();

    return () => cleanup?.();
  });
</script>

<svelte:element this={as} class="text-split {className}" bind:this={el} {...rest}>
  {@render children()}
</svelte:element>

<style>
  .text-split :global(.ts-char),
  .text-split :global(.ts-word) {
    display: inline-block;
    will-change: transform, opacity;
  }
  .text-split :global(.ts-space) {
    width: 0.25em;
  }
</style>
