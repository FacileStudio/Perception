<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  let { class: className = '', value = $bindable(''), ...rest }: HTMLInputAttributes & { value?: string } = $props();
</script>

<input
  class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 {className}"
  bind:value
  {...rest}
/>
