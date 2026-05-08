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

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:users-group-rounded-bold-duotone" class="size-4 text-zinc-500" />
    <span class="text-sm font-semibold text-zinc-900">Actor Activity</span>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-zinc-200 text-zinc-400 text-xs">limited sample</Badge>
    {/if}
  </div>

  <div class="bg-zinc-50 rounded-xl px-3 py-2 w-fit">
    <p class="text-xs text-zinc-400">Avg events/actor</p>
    <p class="text-sm font-semibold text-zinc-900">{mean.toFixed(1)}</p>
  </div>

  {#if isEmpty}
    <p class="text-sm text-zinc-400 py-6 text-center">No actor data in this window</p>
  {:else}
    <HorizontalBar data={chartData} />
  {/if}
</div>
