<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import Icon from '@iconify/svelte';

  let {
    snapshots,
    window,
  }: {
    snapshots: StatsSnapshot[];
    window: '7d' | '30d';
  } = $props();

  const coverageSnap = $derived(
    snapshots.find((s) => s.kind === `entity_coverage_${window}`)
  );
  const actorSnap = $derived(
    snapshots.find((s) => s.kind === `actor_activity_${window}`)
  );

  const totalEvents = $derived(() => {
    if (!coverageSnap) return null;
    return Number(coverageSnap.data.total ?? 0);
  });

  const uniqueEntities = $derived(() => {
    if (!coverageSnap) return null;
    return Number(coverageSnap.data.unique_entities ?? 0);
  });

  const labelCoveragePct = $derived(() => {
    if (!coverageSnap) return null;
    return Number(coverageSnap.data.label_coverage_pct ?? 0);
  });

  const activeActors = $derived(() => {
    if (!actorSnap) return null;
    const actors = (actorSnap.data.actors ?? {}) as Record<string, number>;
    return Object.keys(actors).length;
  });

  type KpiCard = {
    icon: string;
    label: string;
    value: number | null;
    suffix?: string;
  };

  const cards = $derived<KpiCard[]>([
    { icon: 'solar:chart-square-linear', label: 'Total Events', value: totalEvents() },
    { icon: 'solar:buildings-2-linear', label: 'Unique Entities', value: uniqueEntities() },
    { icon: 'solar:tag-linear', label: 'Labeled', value: labelCoveragePct(), suffix: '%' },
    { icon: 'solar:users-group-rounded-linear', label: 'Active Actors', value: activeActors() },
  ]);
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
  {#each cards as card}
    <Card class="rounded-2xl border border-border p-4">
      <div class="flex items-start justify-between mb-3">
        <div></div>
        <Icon icon={card.icon} class="size-5 text-muted-foreground" />
      </div>
      <p class="font-mono text-2xl font-semibold text-foreground">
        {card.value !== null ? card.value : '—'}{card.suffix ?? ''}
      </p>
      <p class="text-xs text-muted-foreground mt-0.5">{card.label}</p>
    </Card>
  {/each}
</div>
