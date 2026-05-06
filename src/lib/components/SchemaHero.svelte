<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let el: HTMLDivElement;
  let pulseCleanup: (() => void) | undefined;

  type TableDef = { name: string; cols: string; layer: "back" | "mid" | "front"; pos: string; warm: boolean };

  const tables: TableDef[] = [
    { name: "EMPLOYEES",  cols: "id, role, hired", layer: "back",  pos: "top: 6%; left: 4%;",     warm: true  },
    { name: "ADDRESSES",  cols: "cust_id, city",   layer: "back",  pos: "top: 8%; right: 4%;",    warm: true  },
    { name: "INVENTORY",  cols: "prod_id, qty",    layer: "back",  pos: "bottom: 8%; left: 6%;",  warm: false },
    { name: "SHIPMENTS",  cols: "order_id, eta",   layer: "back",  pos: "bottom: 6%; right: 6%;", warm: false },
    { name: "LINE_ITEMS", cols: "order_id, qty",   layer: "mid",   pos: "top: 22%; left: 12%;",   warm: true  },
    { name: "PRODUCTS",   cols: "id, sku",         layer: "mid",   pos: "top: 24%; right: 12%;",  warm: false },
    { name: "INVOICES",   cols: "id, paid",        layer: "mid",   pos: "bottom: 24%; left: 14%;",warm: true  },
    { name: "PAYMENTS",   cols: "id, amount",      layer: "mid",   pos: "bottom: 22%; right: 14%;",warm: false },
    { name: "CUSTOMERS",  cols: "id, name, tier",  layer: "front", pos: "top: 38%; left: 2%;",    warm: true  },
    { name: "ORDERS",     cols: "id, total, ts",   layer: "front", pos: "top: 38%; right: 2%;",   warm: false },
  ];

  // FK lines as percentage-based positions so they scale with the hero size
  const fkLines = [
    { from: { x: 18, y: 12 }, to: { x: 82, y: 12 }, warm: true,  width: 64, top: 12 },
    { from: { x: 22, y: 28 }, to: { x: 78, y: 28 }, warm: true,  width: 56, top: 28 },
    { from: { x: 24, y: 42 }, to: { x: 76, y: 42 }, warm: false, width: 52, top: 42 },
    { from: { x: 26, y: 58 }, to: { x: 50, y: 42 }, warm: true,  width: 32, top: 50, rotate: -28 },
    { from: { x: 50, y: 42 }, to: { x: 74, y: 58 }, warm: false, width: 32, top: 50, rotate: 28 },
    { from: { x: 18, y: 76 }, to: { x: 82, y: 76 }, warm: true,  width: 64, top: 76 },
    { from: { x: 24, y: 90 }, to: { x: 76, y: 90 }, warm: false, width: 52, top: 90 },
    { from: { x: 30, y: 60 }, to: { x: 70, y: 60 }, warm: false, width: 40, top: 60 },
  ];

  // Pulses (4 traveling dots on selected lines)
  const pulses = [
    { lineIdx: 0, delay: 0,   duration: 3.2, warm: true  },
    { lineIdx: 2, delay: 0.8, duration: 4.0, warm: false },
    { lineIdx: 5, delay: 1.6, duration: 3.6, warm: true  },
    { lineIdx: 7, delay: 2.4, duration: 4.4, warm: false },
  ];

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Mouse parallax: nudge layers ~5px max
    let raf = 0;
    let pendingX = 0;
    let pendingY = 0;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pendingX = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1..1
      pendingY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const apply = () => {
      raf = 0;
      el.style.setProperty("--mx-back",  `${pendingX * 4}px`);
      el.style.setProperty("--my-back",  `${pendingY * 4}px`);
      el.style.setProperty("--mx-mid",   `${pendingX * 2.5}px`);
      el.style.setProperty("--my-mid",   `${pendingY * 2.5}px`);
      el.style.setProperty("--mx-front", `${pendingX * 1.2}px`);
      el.style.setProperty("--my-front", `${pendingY * 1.2}px`);
    };

    // Only attach when hero is in view (perf)
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.addEventListener("mousemove", handleMove, { passive: true });
            el.classList.add("schema-hero--active");
          } else {
            window.removeEventListener("mousemove", handleMove);
            el.classList.remove("schema-hero--active");
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);

    pulseCleanup = () => {
      io.disconnect();
      window.removeEventListener("mousemove", handleMove);
      if (raf) cancelAnimationFrame(raf);
    };
  });

  onDestroy(() => pulseCleanup?.());
</script>

<div class="schema-hero" bind:this={el} aria-hidden="true">
  <!-- FK lines first so tables sit on top -->
  {#each fkLines as line}
    <div
      class="fk-line {line.warm ? 'warm' : 'cool'}"
      style="top: {line.top}%; left: {line.from.x}%; width: {line.width}%; {line.rotate ? `transform: rotate(${line.rotate}deg); transform-origin: left center;` : ''}"
    ></div>
  {/each}
  <!-- Pulses on top of lines -->
  {#each pulses as pulse}
    {@const line = fkLines[pulse.lineIdx]}
    <div
      class="pulse {pulse.warm ? 'warm' : 'cool'}"
      style="
        top: {line.top}%;
        left: {line.from.x}%;
        --travel-distance: {line.width}%;
        animation-duration: {pulse.duration}s;
        animation-delay: -{pulse.delay}s;
      "
    ></div>
  {/each}
  <!-- Tables -->
  {#each tables as t}
    <div class="tab tab--{t.layer} {t.warm ? 'warm' : 'cool'}" style={t.pos}>
      <span class="tab-name">{t.name}</span>
      <small>{t.cols}</small>
    </div>
  {/each}
</div>

<style>
  .schema-hero {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    --mx-back: 0px;  --my-back: 0px;
    --mx-mid: 0px;   --my-mid: 0px;
    --mx-front: 0px; --my-front: 0px;
  }

  .tab {
    position: absolute;
    border-radius: 4px;
    background: linear-gradient(180deg, rgba(28, 22, 16, 0.92), rgba(16, 12, 8, 0.96));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9.5px;
    line-height: 1.3;
    padding: 4px 6px 3px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    will-change: transform;
  }
  .tab small {
    display: block;
    color: rgba(245, 241, 232, 0.45);
    font-size: 8px;
    text-transform: none;
    letter-spacing: 0;
  }
  .tab.warm { border: 1px solid rgba(253, 186, 116, 0.4); color: rgba(253, 186, 116, 0.85); }
  .tab.cool { border: 1px solid rgba(138, 216, 251, 0.4); color: rgba(156, 226, 255, 0.85); }
  .tab--back  { opacity: 0.5;  filter: blur(0.5px); transform: translate(var(--mx-back),  var(--my-back)); }
  .tab--mid   { opacity: 0.7;                       transform: translate(var(--mx-mid),   var(--my-mid)); }
  .tab--front { opacity: 0.85;                      transform: translate(var(--mx-front), var(--my-front)); }

  .fk-line {
    position: absolute;
    height: 1px;
    pointer-events: none;
    transform-origin: left center;
  }
  .fk-line.warm {
    background: linear-gradient(to right, rgba(253, 186, 116, 0.05), rgba(253, 186, 116, 0.5), rgba(253, 186, 116, 0.05));
  }
  .fk-line.cool {
    background: linear-gradient(to right, rgba(138, 216, 251, 0.05), rgba(138, 216, 251, 0.5), rgba(138, 216, 251, 0.05));
  }

  .pulse {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    will-change: left, opacity;
  }
  .pulse.warm { background: #fdba74; box-shadow: 0 0 10px rgba(253, 186, 116, 0.95); }
  .pulse.cool { background: #9ce2ff; box-shadow: 0 0 10px rgba(156, 226, 255, 0.95); }
  :global(.schema-hero--active) .pulse {
    animation-name: pulse-travel;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }
  @keyframes pulse-travel {
    0%   { transform: translate(0, -50%);                       opacity: 0; }
    8%   {                                                      opacity: 1; }
    92%  {                                                      opacity: 1; }
    100% { transform: translate(var(--travel-distance), -50%);  opacity: 0; }
  }

  /* Mobile: drop the back layer entirely; reduce density */
  @media (max-width: 767px) {
    .tab--back { display: none; }
    .schema-hero { opacity: 0.6; }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.schema-hero--active) .pulse {
      animation: none;
      opacity: 1;
      transform: translate(calc(var(--travel-distance) * 0.5), -50%);
    }
    .tab { transform: none !important; }
  }
</style>
