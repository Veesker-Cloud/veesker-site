<script lang="ts">
  // 7 particles, dessynchronized
  const particles = Array.from({ length: 7 }, (_, i) => ({
    delay: -(i * 1.6),
    duration: 6 + (i % 3),
  }));
</script>

<div class="pipeline-spine" aria-hidden="true">
  <div class="spine-glow"></div>
  <div class="spine-line"></div>
  {#each particles as p}
    <div class="spine-particle" style="animation-duration: {p.duration}s; animation-delay: {p.delay}s;"></div>
  {/each}
</div>

<style>
  .pipeline-spine {
    position: fixed;
    top: 0;
    bottom: 0;
    right: 8%;
    width: 2px;
    z-index: 0;
    pointer-events: none;
  }
  .spine-line {
    position: absolute;
    inset: 0;
    width: 1px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(138, 216, 251, 0.08) 6%,
      rgba(138, 216, 251, 0.32) 50%,
      rgba(138, 216, 251, 0.08) 94%,
      transparent 100%
    );
  }
  .spine-glow {
    position: absolute;
    inset: 0;
    width: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: radial-gradient(
      ellipse 30px 50% at 50% 50%,
      rgba(43, 180, 238, 0.08),
      transparent 70%
    );
    filter: blur(8px);
  }
  .spine-particle {
    position: absolute;
    left: 50%;
    top: 0;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: #9ce2ff;
    box-shadow: 0 0 10px rgba(156, 226, 255, 0.95);
    animation-name: spine-flow;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }
  @keyframes spine-flow {
    0%   { transform: translateY(-10px); opacity: 0; }
    8%   { opacity: 1; }
    92%  { opacity: 1; }
    100% { transform: translateY(100vh); opacity: 0; }
  }

  /* Tablet: hairline only, no particles */
  @media (max-width: 1023px) and (min-width: 768px) {
    .pipeline-spine { right: 24px; }
    .spine-particle { display: none; }
    .spine-glow { display: none; }
  }
  /* Mobile: hidden entirely */
  @media (max-width: 767px) {
    .pipeline-spine { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spine-particle {
      animation: none;
      opacity: 1;
    }
    .spine-particle:nth-child(1) { transform: translateY(20vh); }
    .spine-particle:nth-child(2) { transform: translateY(35vh); }
    .spine-particle:nth-child(3) { transform: translateY(50vh); }
    .spine-particle:nth-child(4) { transform: translateY(65vh); }
    .spine-particle:nth-child(5) { transform: translateY(80vh); }
    .spine-particle:nth-child(n+6) { display: none; }
  }
</style>
