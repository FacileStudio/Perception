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

<div class="inline-flex rounded-full border border-zinc-200 p-0.5 gap-0.5">
  {#each options as opt}
    <button
      type="button"
      class="px-3 py-1 rounded-full text-xs font-medium transition-colors {window === opt
        ? 'bg-zinc-900 text-white'
        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}"
      onclick={() => onchange(opt)}
    >
      {opt}
    </button>
  {/each}
</div>
