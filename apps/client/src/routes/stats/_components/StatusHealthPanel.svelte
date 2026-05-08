<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import Icon from '@iconify/svelte';

  let { snap }: { snap: StatsSnapshot } = $props();

  const STATUS_COLORS: Record<string, string> = {
    open: '#3b82f6', active: '#3b82f6', in_progress: '#3b82f6',
    closed: '#10b981', done: '#10b981', completed: '#10b981', merged: '#10b981',
    blocked: '#ef4444', failed: '#ef4444', error: '#ef4444',
    pending: '#f59e0b', waiting: '#f59e0b', review: '#f59e0b',
  };

  function statusColor(s: string): string {
    return STATUS_COLORS[s.toLowerCase()] ?? '#71717a';
  }

  const distribution = $derived(
    (snap.data.distribution ?? {}) as Record<string, number>
  );

  const totalEvents = $derived(
    Object.values(distribution).reduce((sum, v) => sum + v, 0)
  );

  const chartData = $derived(
    Object.entries(distribution).map(([label, value]) => ({
      label,
      value,
      color: statusColor(label),
    }))
  );

  const isEmpty = $derived(Object.keys(distribution).length === 0);
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:health-bold-duotone" class="size-4 text-zinc-500" />
    <span class="text-sm font-semibold text-zinc-900">Status Health</span>
    <Badge variant="secondary" class="text-xs">{totalEvents}</Badge>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-zinc-200 text-zinc-400 text-xs">limited sample</Badge>
    {/if}
  </div>

  {#if isEmpty}
    <p class="text-sm text-zinc-400 py-6 text-center">No status data in this window</p>
  {:else}
    <DonutChart data={chartData} />
  {/if}
</div>
