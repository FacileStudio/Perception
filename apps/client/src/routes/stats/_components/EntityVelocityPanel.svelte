<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import Icon from '@iconify/svelte';

  let { snap }: { snap: StatsSnapshot } = $props();

  type VelocityEntry = { current: number; previous: number; delta: number }

  const ENTITY_COLORS: [string, string][] = [
    ['deployment', '#6366f1'], ['service', '#6366f1'], ['monitor', '#6366f1'],
    ['contract', '#7c3aed'], ['document', '#7c3aed'], ['submission', '#7c3aed'],
    ['client', '#059669'], ['organization', '#059669'], ['company', '#059669'], ['account', '#059669'],
    ['task', '#2563eb'], ['work_item', '#2563eb'], ['issue', '#2563eb'],
    ['person', '#db2777'], ['contact', '#db2777'], ['signer', '#db2777'],
    ['invoice', '#d97706'], ['payment', '#d97706'], ['financial', '#d97706'],
  ]

  function entityColor(label: string): string {
    for (const [key, color] of ENTITY_COLORS) {
      if (label.includes(key)) return color
    }
    return '#6b7280'
  };

  const velocity = $derived(
    (snap.data.velocity ?? {}) as Record<string, VelocityEntry>
  );

  const mean = $derived(typeof snap.data.mean === 'number' ? snap.data.mean : 0);
  const stdDev = $derived(typeof snap.data.std_dev === 'number' ? snap.data.std_dev : 0);

  const totalCurrent = $derived(
    Object.values(velocity).reduce((sum, v) => sum + v.current, 0)
  );

  const chartData = $derived(
    Object.entries(velocity).map(([label, v]) => ({
      label,
      current: v.current,
      previous: v.previous,
      color: entityColor(label),
    }))
  );

  const isEmpty = $derived(Object.keys(velocity).length === 0);
</script>

<div class="flex h-full flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:pulse-linear" class="size-4 text-muted-foreground" />
    <span class="text-sm font-semibold text-foreground">Entity Velocity</span>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-border text-muted-foreground text-xs">limited sample</Badge>
    {/if}
  </div>

  <div class="flex gap-3">
    <div class="bg-muted rounded-xl px-3 py-2">
      <p class="text-xs text-muted-foreground">Total Current</p>
      <p class="font-mono text-sm font-semibold text-foreground">{totalCurrent}</p>
    </div>
    <div class="bg-muted rounded-xl px-3 py-2">
      <p class="text-xs text-muted-foreground">Mean</p>
      <p class="font-mono text-sm font-semibold text-foreground">{mean.toFixed(1)}</p>
    </div>
    <div class="bg-muted rounded-xl px-3 py-2">
      <p class="text-xs text-muted-foreground">StdDev</p>
      <p class="font-mono text-sm font-semibold text-foreground">{stdDev.toFixed(1)}</p>
    </div>
  </div>

  {#if isEmpty}
    <p class="flex flex-1 items-center justify-center text-sm text-muted-foreground">No entity data in this window</p>
  {:else}
    <div class="flex-1 min-h-[120px]">
      <BarChart data={chartData} height={150} />
    </div>
  {/if}
</div>
