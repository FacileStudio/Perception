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

  const velocitySnap = $derived(
    snapshots.find((s) => s.kind === `entity_velocity_${window}`)
  );
  const statusSnap = $derived(
    snapshots.find((s) => s.kind === `status_health_${window}`)
  );
  const actorSnap = $derived(
    snapshots.find((s) => s.kind === `actor_activity_${window}`)
  );

  const totalEvents = $derived(() => {
    if (!velocitySnap) return null;
    const velocity = (velocitySnap.data.velocity ?? {}) as Record<string, { current: number }>;
    return Object.values(velocity).reduce((sum, v) => sum + v.current, 0);
  });

  const trackedStatuses = $derived(() => {
    if (!statusSnap) return null;
    const distribution = (statusSnap.data.distribution ?? {}) as Record<string, number>;
    return Object.keys(distribution).length;
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
  };

  const cards = $derived<KpiCard[]>([
    { icon: 'solar:chart-square-bold-duotone', label: 'Total Events', value: totalEvents() },
    { icon: 'solar:tag-bold-duotone', label: 'Tracked Statuses', value: trackedStatuses() },
    { icon: 'solar:users-group-rounded-bold-duotone', label: 'Active Actors', value: activeActors() },
  ]);
</script>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
  {#each cards as card}
    <Card class="rounded-[20px] border-zinc-200/80 p-4 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)]">
      <div class="bg-zinc-100 rounded-xl p-2 w-fit mb-3">
        <Icon icon={card.icon} class="size-5 text-zinc-600" />
      </div>
      <p class="text-2xl font-semibold text-zinc-900">
        {card.value !== null ? card.value : '—'}
      </p>
      <p class="text-xs text-zinc-400 mt-0.5">{card.label}</p>
    </Card>
  {/each}
</div>
