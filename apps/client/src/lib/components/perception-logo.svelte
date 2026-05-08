<script lang="ts">
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let {
    class: className = '',
    badgeClass = '',
    textClass = '',
    titleClass = '',
    subtitle = 'Operational memory, less nonsense',
    showWordmark = true,
    iconSizeClass = 'size-5',
  }: {
    class?: string;
    badgeClass?: string;
    textClass?: string;
    titleClass?: string;
    subtitle?: string;
    showWordmark?: boolean;
    iconSizeClass?: string;
  } = $props();
</script>

<div class={`flex items-center gap-3 ${className}`}>
  <span class={`flex size-11 items-center justify-center rounded-2xl bg-zinc-950 text-white ring-1 ring-zinc-200 shadow-[0_12px_30px_-18px_rgba(24,24,27,0.8)] ${badgeClass}`}>
    <Icon icon="solar:eye-bold-duotone" class={iconSizeClass} />
  </span>
  {#if showWordmark}
    <div class={`flex flex-col ${textClass}`}>
      <span class={`font-[Goga] text-lg leading-none tracking-tight text-zinc-950 ${titleClass}`}>Perception</span>
      <span class="text-xs text-zinc-500">{subtitle}</span>
    </div>
  {/if}
</div>
