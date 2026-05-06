<script lang="ts">
  let {
    cellSize = 56,
    lineColor = "rgba(245, 241, 232, 0.06)",
    glowColor = "rgba(249, 115, 22, 0.55)",
  }: {
    cellSize?: number;
    lineColor?: string;
    glowColor?: string;
  } = $props();
</script>

<div
  class="grid-beams"
  aria-hidden="true"
  style="--cell:{cellSize}px;--line:{lineColor};--glow:{glowColor};"
>
  <div class="grid-beams-grid"></div>
  <div class="grid-beams-fade"></div>
  <div class="beam beam-1"></div>
  <div class="beam beam-2"></div>
  <div class="beam beam-3"></div>
</div>

<style>
  .grid-beams {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .grid-beams-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, var(--line) 1px, transparent 1px),
      linear-gradient(to bottom, var(--line) 1px, transparent 1px);
    background-size: var(--cell) var(--cell);
    mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 0%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 0%, transparent 75%);
  }

  .grid-beams-fade {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 70% 50% at 50% 110%, var(--glow), transparent 65%),
      radial-gradient(ellipse 40% 30% at 20% 30%, rgba(138, 216, 251, 0.18), transparent 60%);
  }

  .beam {
    position: absolute;
    top: -10%;
    width: 1px;
    height: 120%;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      var(--glow) 35%,
      rgba(245, 241, 232, 0.95) 50%,
      var(--glow) 65%,
      transparent 100%
    );
    filter: blur(0.5px);
    opacity: 0;
    animation: beam-fall 7s linear infinite;
  }
  .beam-1 { left: 18%; animation-delay: 0s; }
  .beam-2 { left: 48%; animation-delay: 2.4s; animation-duration: 9s; }
  .beam-3 { left: 78%; animation-delay: 4.8s; animation-duration: 8s; }

  @keyframes beam-fall {
    0%   { transform: translateY(-100%); opacity: 0; }
    8%   { opacity: 0.85; }
    92%  { opacity: 0.85; }
    100% { transform: translateY(100%); opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .beam { animation: none; opacity: 0; }
  }
</style>
