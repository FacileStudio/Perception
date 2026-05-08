<script lang="ts">
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let {
    class: className = '',
    textClass = '',
    titleClass = '',
    subtitle = '',
    showWordmark = true,
    iconSizeClass = 'size-5',
  }: {
    class?: string;
    textClass?: string;
    titleClass?: string;
    subtitle?: string;
    showWordmark?: boolean;
    iconSizeClass?: string;
  } = $props();
</script>

<div class={`flex items-center gap-3 ${className}`}>
  <span class="flex size-11 items-center justify-center text-zinc-950">
    <Icon icon="solar:eye-bold-duotone" class={iconSizeClass} />
  </span>
  {#if showWordmark}
    <div class={`flex flex-col ${textClass}`}>
      <span class={`font-[Goga] text-lg leading-none tracking-tight text-zinc-950 ${titleClass}`}>Perception</span>
      {#if subtitle}
        <span class="text-xs text-zinc-500">{subtitle}</span>
      {/if}
    </div>
  {/if}
</div>
