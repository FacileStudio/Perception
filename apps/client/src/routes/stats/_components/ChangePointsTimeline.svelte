<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const points = $derived(data.change_points);

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  function direction(pre: number, post: number): { label: string; icon: string; cls: string } {
    if (post < pre) return { label: 'accelerated', icon: 'solar:double-alt-arrow-up-linear', cls: 'text-emerald-600 bg-emerald-50' };
    return { label: 'slowed down', icon: 'solar:double-alt-arrow-down-linear', cls: 'text-amber-600 bg-amber-50' };
  }
</script>

<div class="flex items-center gap-2 mb-4">
  <Icon icon="solar:pulse-2-linear" class="size-4 text-muted-foreground" />
  <span class="text-sm font-semibold text-foreground">Regime Changes</span>
  <span class="text-xs text-muted-foreground ml-auto">last 30 days</span>
</div>

{#if points.length === 0}
  <div class="flex flex-col items-center gap-2 py-6 text-center">
    <Icon icon="solar:check-circle-linear" class="size-6 text-emerald-300" />
    <span class="text-xs text-muted-foreground">No regime changes detected. All entities stable.</span>
  </div>
{:else}
  <div class="space-y-2 max-h-64 overflow-y-auto">
    {#each points as point}
      {@const dir = direction(point.pre_mean, point.post_mean)}
      <div class="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-lg {dir.cls}">
          <Icon icon={dir.icon} class="size-3.5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-foreground truncate">{point.entity_name}</span>
            <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium {dir.cls}">{dir.label}</span>
          </div>
          <p class="text-[10px] text-muted-foreground mt-0.5">
            ~{point.pre_mean.toFixed(1)}h → ~{point.post_mean.toFixed(1)}h between events
          </p>
        </div>
        <span class="shrink-0 text-[10px] text-muted-foreground/50">{timeAgo(point.detected_at)}</span>
      </div>
    {/each}
  </div>
{/if}
