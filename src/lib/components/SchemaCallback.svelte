<script lang="ts">
  let { variant = "warm" }: { variant?: "warm" | "cool" } = $props();
</script>

<div class="schema-cb {variant}" aria-hidden="true">
  <div class="cb-tab cb-tab-1"></div>
  <div class="cb-tab cb-tab-2"></div>
  <div class="cb-line"></div>
  <div class="cb-pulse"></div>
</div>

<style>
  .schema-cb {
    position: absolute;
    width: 60px;
    height: 24px;
    pointer-events: none;
    opacity: 0.55;
  }
  .cb-tab {
    position: absolute;
    width: 18px;
    height: 12px;
    border-radius: 2px;
    background: rgba(28, 22, 16, 0.9);
  }
  .cb-tab-1 { top: 0; left: 0; }
  .cb-tab-2 { bottom: 0; right: 0; }
  .schema-cb.warm .cb-tab { border: 1px solid rgba(253, 186, 116, 0.45); }
  .schema-cb.cool .cb-tab { border: 1px solid rgba(138, 216, 251, 0.45); }
  .cb-line {
    position: absolute;
    top: 50%;
    left: 16px;
    right: 16px;
    height: 1px;
    transform: rotate(20deg);
  }
  .schema-cb.warm .cb-line {
    background: linear-gradient(to right, rgba(253, 186, 116, 0.1), rgba(253, 186, 116, 0.55), rgba(253, 186, 116, 0.1));
  }
  .schema-cb.cool .cb-line {
    background: linear-gradient(to right, rgba(138, 216, 251, 0.1), rgba(138, 216, 251, 0.55), rgba(138, 216, 251, 0.1));
  }
  .cb-pulse {
    position: absolute;
    top: 50%;
    left: 16px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    transform: translateY(-50%);
    animation: cb-flow 4s linear infinite;
  }
  .schema-cb.warm .cb-pulse { background: #fdba74; box-shadow: 0 0 6px rgba(253, 186, 116, 0.9); }
  .schema-cb.cool .cb-pulse { background: #9ce2ff; box-shadow: 0 0 6px rgba(156, 226, 255, 0.9); }
  @keyframes cb-flow {
    0%   { left: 16px;               opacity: 0; }
    20%  {                           opacity: 1; }
    80%  {                           opacity: 1; }
    100% { left: calc(100% - 16px);  opacity: 0; }
  }
  @media (max-width: 767px) { .schema-cb { display: none; } }
  @media (prefers-reduced-motion: reduce) { .cb-pulse { animation: none; left: 50%; opacity: 1; } }
</style>
