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
    iconFrameClass = 'size-11',
  }: {
    class?: string;
    textClass?: string;
    titleClass?: string;
    subtitle?: string;
    showWordmark?: boolean;
    iconSizeClass?: string;
    iconFrameClass?: string;
  } = $props();
</script>

<div class={`flex items-center gap-3 ${className}`}>
  <span class={`flex items-center justify-center text-zinc-950 ${iconFrameClass}`}>
    <Icon icon="solar:eye-linear" class={iconSizeClass} />
  </span>
  {#if showWordmark}
    <div class={`flex flex-col ${textClass}`}>
      <span class={`font-[Goga] leading-none tracking-tight text-zinc-950 ${titleClass || 'text-lg'}`}>Perception</span>
      {#if subtitle}
        <span class="text-xs text-zinc-500">{subtitle}</span>
      {/if}
    </div>
  {/if}
</div>
