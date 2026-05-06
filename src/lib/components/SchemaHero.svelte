<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let el: HTMLDivElement;
  let cleanup: (() => void) | undefined;

  type TableDef = { name: string; cols: string; layer: "back" | "mid" | "front"; pos: string; warm: boolean };
  type PulseDef = { delay: number; duration: number; warm: boolean };
  type FkLine  = { x: number; fromRight?: boolean; top: number; height: number; warm: boolean; pulse?: PulseDef };

  const tables: TableDef[] = [
    { name: "EMPLOYEES",  cols: "id, role, hired",  layer: "back",  pos: "top: 6%; left: 4%;",      warm: true  },
    { name: "ADDRESSES",  cols: "cust_id, city",    layer: "back",  pos: "top: 8%; right: 4%;",     warm: true  },
    { name: "INVENTORY",  cols: "prod_id, qty",     layer: "back",  pos: "bottom: 8%; left: 6%;",   warm: false },
    { name: "SHIPMENTS",  cols: "order_id, eta",    layer: "back",  pos: "bottom: 6%; right: 6%;",  warm: false },
    { name: "LINE_ITEMS", cols: "order_id, qty",    layer: "mid",   pos: "top: 22%; left: 12%;",    warm: true  },
    { name: "PRODUCTS",   cols: "id, sku",          layer: "mid",   pos: "top: 24%; right: 12%;",   warm: false },
    { name: "INVOICES",   cols: "id, paid",         layer: "mid",   pos: "bottom: 24%; left: 14%;", warm: true  },
    { name: "PAYMENTS",   cols: "id, amount",       layer: "mid",   pos: "bottom: 22%; right: 14%;",warm: false },
    { name: "CUSTOMERS",  cols: "id, name, tier",   layer: "front", pos: "top: 38%; left: 2%;",     warm: true  },
    { name: "ORDERS",     cols: "id, total, ts",    layer: "front", pos: "top: 38%; right: 2%;",    warm: false },
  ];

  // Vertical FK lines connecting left-column tables (warm) and right-column tables (cool)
  const fkLines: FkLine[] = [
    // Left side — EMPLOYEES → LINE_ITEMS → CUSTOMERS → INVOICES → INVENTORY
    { x: 8,  top: 10, height: 12, warm: true,  pulse: { delay: 0,   duration: 3.2, warm: true  } },
    { x: 7,  top: 26, height: 12, warm: true  },
    { x: 8,  top: 42, height: 28, warm: true,  pulse: { delay: 1.6, duration: 3.6, warm: true  } },
    { x: 9,  top: 74, height: 12, warm: true  },
    // Right side — ADDRESSES → PRODUCTS → ORDERS → PAYMENTS → SHIPMENTS
    { x: 8,  fromRight: true, top: 12, height: 12, warm: false, pulse: { delay: 0.8, duration: 4.0, warm: false } },
    { x: 7,  fromRight: true, top: 28, height: 10, warm: false },
    { x: 8,  fromRight: true, top: 42, height: 28, warm: false, pulse: { delay: 2.4, duration: 4.4, warm: false } },
    { x: 9,  fromRight: true, top: 74, height: 12, warm: false },
  ];

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let pendingX = 0;
    let pendingY = 0;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      pendingX = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
      pendingY = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
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

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            window.addEventListener("mousemove", handleMove, { passive: true });
          } else {
            window.removeEventListener("mousemove", handleMove);
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);

    cleanup = () => {
      io.disconnect();
      window.removeEventListener("mousemove", handleMove);
      if (raf) cancelAnimationFrame(raf);
    };
  });

  onDestroy(() => cleanup?.());
</script>

<div class="schema-hero" bind:this={el} aria-hidden="true">
  {#each fkLines as line}
    <div
      class="fk-line {line.warm ? 'warm' : 'cool'}"
      style="top: {line.top}%; {line.fromRight ? `right: ${line.x}%` : `left: ${line.x}%`}; height: {line.height}%;"
    >
      {#if line.pulse}
        <div
          class="pulse {line.pulse.warm ? 'warm' : 'cool'}"
          style="animation-duration: {line.pulse.duration}s; animation-delay: -{line.pulse.delay}s;"
        ></div>
      {/if}
    </div>
  {/each}
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
  .tab--back  { opacity: 0.5;  filter: blur(0.5px); transform: translate(var(--mx-back),  var(--my-back));  will-change: transform; }
  .tab--mid   { opacity: 0.7;                       transform: translate(var(--mx-mid),   var(--my-mid));   will-change: transform; }
  .tab--front { opacity: 0.85;                      transform: translate(var(--mx-front), var(--my-front)); will-change: transform; }

  .fk-line {
    position: absolute;
    width: 1px;
    pointer-events: none;
  }
  .fk-line.warm { background: linear-gradient(to bottom, rgba(253, 186, 116, 0.05), rgba(253, 186, 116, 0.5), rgba(253, 186, 116, 0.05)); }
  .fk-line.cool { background: linear-gradient(to bottom, rgba(138, 216, 251, 0.05), rgba(138, 216, 251, 0.5), rgba(138, 216, 251, 0.05)); }

  /* Pulse travels top → bottom along the vertical FK line */
  .pulse {
    position: absolute;
    left: 50%;
    top: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    will-change: top, opacity;
    animation-name: pulse-travel;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
  }
  .pulse.warm { background: #fdba74; box-shadow: 0 0 10px rgba(253, 186, 116, 0.95); }
  .pulse.cool { background: #9ce2ff; box-shadow: 0 0 10px rgba(156, 226, 255, 0.95); }

  @keyframes pulse-travel {
    0%   { top: 0;                 opacity: 0; }
    8%   {                          opacity: 1; }
    92%  {                          opacity: 1; }
    100% { top: calc(100% - 5px); opacity: 0; }
  }

  @media (max-width: 767px) {
    .tab--back { display: none; }
    .schema-hero { opacity: 0.6; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse { animation: none; opacity: 1; top: calc(50% - 2.5px); }
    .tab   { transform: none !important; will-change: auto; }
  }
</style>
