<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const total = $derived(data.coverage.total_entities);

  function pct(n: number): number {
    return total > 0 ? Math.round((n / total) * 100) : 0;
  }

  function barColor(p: number): string {
    if (p >= 60) return 'bg-emerald-400';
    if (p >= 30) return 'bg-amber-400';
    return 'bg-red-400';
  }

  const rows = $derived([
    { label: 'With narratives', count: data.coverage.with_narratives, icon: 'solar:document-text-linear' },
    { label: 'In communities', count: data.coverage.in_communities, icon: 'solar:users-group-rounded-linear' },
    { label: 'With relations', count: data.coverage.with_relations, icon: 'solar:link-round-linear' },
  ]);
</script>

<div class="flex items-center gap-2 mb-4">
  <Icon icon="solar:pie-chart-2-linear" class="size-4 text-zinc-500" />
  <span class="text-sm font-semibold text-zinc-900">Knowledge Coverage</span>
  <span class="text-xs text-zinc-400 ml-auto">{total} entities</span>
</div>

{#if total === 0}
  <div class="flex flex-col items-center gap-2 py-6 text-center">
    <Icon icon="solar:pie-chart-2-linear" class="size-6 text-zinc-300" />
    <span class="text-xs text-zinc-400">No entities yet.</span>
  </div>
{:else}
  <div class="space-y-4">
    {#each rows as row}
      {@const p = pct(row.count)}
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <Icon icon={row.icon} class="size-3.5 text-zinc-400" />
            <span class="text-xs text-zinc-600">{row.label}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-zinc-500">{row.count}/{total}</span>
            <span class="text-[10px] font-medium {p >= 60 ? 'text-emerald-600' : p >= 30 ? 'text-amber-600' : 'text-red-500'}">{p}%</span>
          </div>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            class="h-full rounded-full transition-all duration-700 {barColor(p)}"
            style="width: {p}%"
          ></div>
        </div>
      </div>
    {/each}
  </div>
{/if}
