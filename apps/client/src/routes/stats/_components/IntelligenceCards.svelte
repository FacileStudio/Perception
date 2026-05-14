<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const lcc = $derived(data.graph_health ? Math.round(data.graph_health.largest_component_ratio * 100) : null);

  function lccColor(pct: number | null): string {
    if (pct === null) return 'text-zinc-400';
    if (pct >= 60) return 'text-emerald-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-red-500';
  }

  const cards = $derived([
    {
      icon: 'solar:graph-linear',
      label: 'Graph Connectivity',
      value: lcc !== null ? `${lcc}%` : '—',
      color: lccColor(lcc),
      sub: data.graph_health ? `${data.graph_health.node_count} nodes · ${data.graph_health.edge_count} edges` : null,
    },
    {
      icon: 'solar:brain-linear',
      label: 'Memory Episodes',
      value: String(data.memory_episodes),
      color: data.memory_episodes > 0 ? 'text-violet-600' : 'text-zinc-400',
      sub: 'durable facts stored',
    },
    {
      icon: 'solar:pulse-2-linear',
      label: 'Change Points',
      value: String(data.change_points_30d),
      color: data.change_points_30d > 5 ? 'text-amber-600' : data.change_points_30d > 0 ? 'text-blue-600' : 'text-zinc-400',
      sub: 'regime shifts (30d)',
    },
    {
      icon: 'solar:shield-warning-linear',
      label: 'Drift Alerts',
      value: String(data.drift_alerts_30d),
      color: data.drift_alerts_30d > 0 ? 'text-red-500' : 'text-emerald-600',
      sub: data.drift_alerts_30d > 0 ? 'schemas invalidated' : 'all stable',
    },
  ]);
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
  {#each cards as card}
    <Card class="rounded-[20px] border-zinc-200/80 p-4 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)]">
      <div class="flex items-start justify-between mb-2">
        <div></div>
        <Icon icon={card.icon} class="size-5 text-zinc-400" />
      </div>
      <p class="font-mono text-2xl font-semibold {card.color}">{card.value}</p>
      <p class="text-xs text-zinc-400 mt-0.5">{card.label}</p>
      {#if card.sub}
        <p class="text-[10px] text-zinc-300 mt-1">{card.sub}</p>
      {/if}
    </Card>
  {/each}
</div>
