<script lang="ts">
  let {
    window,
    onchange,
  }: {
    window: '7d' | '30d';
    onchange: (w: '7d' | '30d') => void;
  } = $props();

  const options: ('7d' | '30d')[] = ['7d', '30d'];
</script>

<div class="inline-flex rounded-full border border-border p-0.5 gap-0.5">
  {#each options as opt}
    <button
      type="button"
      class="px-3 py-1 rounded-full text-xs font-medium transition-colors {window === opt
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-muted-foreground hover:bg-border'}"
      onclick={() => onchange(opt)}
    >
      {opt}
    </button>
  {/each}
</div>
