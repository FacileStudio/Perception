<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type StatsSnapshot } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import SummaryCards from './_components/SummaryCards.svelte';
  import WindowToggle from './_components/WindowToggle.svelte';
  import EntityVelocityPanel from './_components/EntityVelocityPanel.svelte';
  import StatusHealthPanel from './_components/StatusHealthPanel.svelte';
  import ActorActivityPanel from './_components/ActorActivityPanel.svelte';

  let snapshots = $state<StatsSnapshot[]>([]);
  let loading = $state(false);
  let error = $state('');
  let activeWindow = $state<'7d' | '30d'>('7d');

  ensureSolar();

  const velocitySnap = $derived(snapshots.find((s) => s.kind === `entity_velocity_${activeWindow}`));
  const statusSnap = $derived(snapshots.find((s) => s.kind === `status_health_${activeWindow}`));
  const actorSnap = $derived(snapshots.find((s) => s.kind === `actor_activity_${activeWindow}`));

  const generatedAt = $derived(
    velocitySnap?.generated_at
      ? new Date(velocitySnap.generated_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null
  );

  async function loadStats(refresh = false) {
    loading = true;
    error = '';
    try {
      const result = await api.stats.get(refresh);
      snapshots = result.snapshots;
    } catch {
      error = 'Failed to load stats.';
      snapshots = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => loadStats());
</script>

<svelte:head>
  <title>{buildTitle('Stats')}</title>
  <meta name="description" content="Signal health, entity velocity, status distribution, and actor activity." />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Icon icon="solar:chart-square-bold-duotone" class="size-4" />
        Stats
      </span>
      {#if generatedAt}
        <span class="text-xs text-zinc-400">Updated {generatedAt}</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <WindowToggle window={activeWindow} onchange={(w) => (activeWindow = w)} />
      <Button variant="outline" size="sm" onclick={() => loadStats(true)} disabled={loading} class="rounded-xl">
        <span class="inline-flex items-center gap-2">
          <Icon icon="solar:restart-bold-duotone" class="size-4" />
          {loading ? 'Loading…' : 'Refresh'}
        </span>
      </Button>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">Loading stats…</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-bold-duotone" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if snapshots.length === 0}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:chart-square-bold-duotone" class="size-8 text-zinc-300" />
        <span class="text-sm text-zinc-400">No stats yet. Ingest some events first.</span>
      </div>
    {:else}
      <div class="flex flex-col gap-5">
        <SummaryCards {snapshots} window={activeWindow} />

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {#if velocitySnap}
            <Card class="rounded-[24px] border-zinc-200/80 p-5 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
              <EntityVelocityPanel snap={velocitySnap} />
            </Card>
          {/if}

          {#if statusSnap}
            <Card class="rounded-[24px] border-zinc-200/80 p-5 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
              <StatusHealthPanel snap={statusSnap} />
            </Card>
          {/if}
        </div>

        {#if actorSnap}
          <Card class="rounded-[24px] border-zinc-200/80 p-5 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
            <ActorActivityPanel snap={actorSnap} />
          </Card>
        {/if}
      </div>
    {/if}
  </div>
</div>
