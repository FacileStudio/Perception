<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import Icon from '@iconify/svelte';

  let { snap }: { snap: StatsSnapshot } = $props();

  type VelocityEntry = { current: number; previous: number; delta: number };

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
    }))
  );

  const isEmpty = $derived(Object.keys(velocity).length === 0);
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:pulse-bold-duotone" class="size-4 text-zinc-500" />
    <span class="text-sm font-semibold text-zinc-900">Entity Velocity</span>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-zinc-200 text-zinc-400 text-xs">limited sample</Badge>
    {/if}
  </div>

  <div class="flex gap-3">
    <div class="bg-zinc-50 rounded-xl px-3 py-2">
      <p class="text-xs text-zinc-400">Total Current</p>
      <p class="text-sm font-semibold text-zinc-900">{totalCurrent}</p>
    </div>
    <div class="bg-zinc-50 rounded-xl px-3 py-2">
      <p class="text-xs text-zinc-400">Mean</p>
      <p class="text-sm font-semibold text-zinc-900">{mean.toFixed(1)}</p>
    </div>
    <div class="bg-zinc-50 rounded-xl px-3 py-2">
      <p class="text-xs text-zinc-400">StdDev</p>
      <p class="text-sm font-semibold text-zinc-900">{stdDev.toFixed(1)}</p>
    </div>
  </div>

  {#if isEmpty}
    <p class="text-sm text-zinc-400 py-6 text-center">No entity data in this window</p>
  {:else}
    <BarChart data={chartData} />
  {/if}
</div>
