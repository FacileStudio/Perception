<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import HorizontalBar from '$lib/components/charts/HorizontalBar.svelte';
  import Icon from '@iconify/svelte';

  let { snap }: { snap: StatsSnapshot } = $props();

  const actors = $derived(
    (snap.data.actors ?? {}) as Record<string, number>
  );

  const mean = $derived(typeof snap.data.mean === 'number' ? snap.data.mean : 0);

  const chartData = $derived(
    Object.entries(actors)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  );

  const isEmpty = $derived(Object.keys(actors).length === 0);
</script>

<div class="flex h-full flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:users-group-rounded-linear" class="size-4 text-zinc-500" />
    <span class="text-sm font-semibold text-zinc-900">Actor Activity</span>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-zinc-200 text-zinc-400 text-xs">limited sample</Badge>
    {/if}
  </div>

  <div class="w-fit rounded-xl bg-zinc-50 px-3 py-2">
    <p class="text-xs text-zinc-400">Avg events/actor</p>
    <p class="font-mono text-sm font-semibold text-zinc-900">{mean.toFixed(1)}</p>
  </div>

  {#if isEmpty}
    <p class="flex flex-1 items-center justify-center text-sm text-zinc-400">No actor data in this window</p>
  {:else}
    <div class="flex-1 min-h-[80px]">
      <HorizontalBar data={chartData} />
    </div>
  {/if}
</div>
