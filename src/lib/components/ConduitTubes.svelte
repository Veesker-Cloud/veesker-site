<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="conduit-row">
  {@render children()}
</div>

<style>
  .conduit-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
    gap: 12px;
    align-items: stretch;
    width: 100%;
  }

  :global(.conduit-row > .conduit) {
    align-self: center;
    width: 100%;
    height: 32px;
    position: relative;
    pointer-events: none;
  }
  :global(.conduit-row > .conduit::before) {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 6px;
    transform: translateY(-50%);
    background: linear-gradient(
      180deg,
      rgba(138, 216, 251, 0.05),
      rgba(138, 216, 251, 0.25),
      rgba(138, 216, 251, 0.05)
    );
    border-top: 1px solid rgba(138, 216, 251, 0.45);
    border-bottom: 1px solid rgba(138, 216, 251, 0.25);
    box-shadow: inset 0 0 8px rgba(43, 180, 238, 0.2);
    border-radius: 3px;
  }
  :global(.conduit-row > .conduit > .conduit-particle) {
    position: absolute;
    top: 50%;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9ce2ff;
    box-shadow: 0 0 12px rgba(156, 226, 255, 0.95), 0 0 20px rgba(43, 180, 238, 0.5);
    transform: translateY(-50%);
    animation: conduit-flow 2s linear infinite;
    will-change: left, opacity;
  }
  :global(.conduit-row > .conduit > .conduit-particle.cp-2) {
    animation-delay: -1s;
  }
  @keyframes conduit-flow {
    0%   { left: 4px;                 opacity: 0; }
    8%   {                            opacity: 1; }
    92%  {                            opacity: 1; }
    100% { left: calc(100% - 10px);   opacity: 0; }
  }

  @media (max-width: 767px) {
    .conduit-row {
      grid-template-columns: 1fr;
      grid-auto-flow: row;
    }
    :global(.conduit-row > .conduit) {
      height: 22px;
      text-align: center;
    }
    :global(.conduit-row > .conduit::before) {
      content: "↓";
      position: static;
      background: none;
      border: none;
      box-shadow: none;
      color: rgba(156, 226, 255, 0.7);
      font-size: 16px;
      transform: none;
    }
    :global(.conduit-row > .conduit > .conduit-particle) {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.conduit-row > .conduit > .conduit-particle) {
      animation: none;
      left: 50%;
      opacity: 1;
    }
  }
</style>
