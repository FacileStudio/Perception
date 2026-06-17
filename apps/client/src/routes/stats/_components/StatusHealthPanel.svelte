<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import Icon from '@iconify/svelte';

  let { snap }: { snap: StatsSnapshot } = $props();

  const STATUS_COLORS: Record<string, string> = {
    open: '#2563eb', active: '#2563eb', in_progress: '#2563eb', running: '#2563eb', started: '#2563eb',
    closed: '#059669', done: '#059669', completed: '#059669', merged: '#059669', resolved: '#059669', succeeded: '#059669', success: '#059669',
    blocked: '#ef4444', failed: '#ef4444', error: '#ef4444', cancelled: '#ef4444', rejected: '#ef4444', down: '#ef4444',
    pending: '#d97706', waiting: '#d97706', review: '#d97706', draft: '#d97706', queued: '#d97706',
    timer_started: '#d97706', timer_stopped: '#6b7280', timer_fired: '#059669',
    paused: '#7c3aed', archived: '#6b7280', unknown: '#94a3b8',
  };

  const STATUS_FALLBACK = ['#6366f1', '#7c3aed', '#059669', '#2563eb', '#db2777', '#d97706'];
  const seenFallback: Record<string, string> = {};
  let fallbackIdx = 0;

  function statusColor(s: string): string {
    const key = s.toLowerCase();
    if (STATUS_COLORS[key]) return STATUS_COLORS[key];
    if (!seenFallback[key]) {
      seenFallback[key] = STATUS_FALLBACK[fallbackIdx % STATUS_FALLBACK.length];
      fallbackIdx++;
    }
    return seenFallback[key];
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

<div class="flex h-full flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:health-linear" class="size-4 text-muted-foreground" />
    <span class="text-sm font-semibold text-foreground">Status Health</span>
    <Badge variant="secondary" class="text-xs">{totalEvents}</Badge>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-border text-muted-foreground text-xs">limited sample</Badge>
    {/if}
  </div>

  {#if isEmpty}
    <p class="text-sm text-muted-foreground py-6 text-center">No status data in this window</p>
  {:else}
    <DonutChart data={chartData} />
  {/if}
</div>
