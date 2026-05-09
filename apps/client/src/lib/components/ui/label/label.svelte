<script lang="ts">
  import type { HTMLLabelAttributes } from 'svelte/elements';
  import { twMerge } from 'tailwind-merge';

  let {
    class: className = '',
    ...rest
  }: HTMLLabelAttributes = $props();
</script>

<label
  class={twMerge('text-sm font-medium leading-none select-none', className)}
  {...rest}
/>
