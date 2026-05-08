<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type StatsSnapshot, type TokenUsageRow } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import SummaryCards from './_components/SummaryCards.svelte';
  import WindowToggle from './_components/WindowToggle.svelte';
  import EntityVelocityPanel from './_components/EntityVelocityPanel.svelte';
  import StatusHealthPanel from './_components/StatusHealthPanel.svelte';
  import ActorActivityPanel from './_components/ActorActivityPanel.svelte';

  let snapshots = $state<StatsSnapshot[]>([]);
  let usage = $state<TokenUsageRow[]>([]);
  let totalCost = $state(0);
  let loading = $state(false);
  let error = $state('');
  let activeWindow = $state<'7d' | '30d'>('7d');
  let lastLoadedAt = 0;

  function formatTokens(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  function formatCost(n: number) {
    if (n === 0) return '$0.00';
    if (n < 0.001) return '<$0.001';
    return '$' + n.toFixed(4);
  }

  function usageIcon(kind: TokenUsageRow['kind']) {
    return kind === 'llm' ? 'solar:magic-stick-2-bold-duotone' : 'solar:layers-bold-duotone';
  }

  function usageIconClass(kind: TokenUsageRow['kind']) {
    return kind === 'llm' ? 'text-violet-500 bg-violet-50' : 'text-blue-500 bg-blue-50';
  }

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

  async function loadStats() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const [statsResult, usageResult] = await Promise.all([api.stats.get(), api.settings.usage()]);
      snapshots = statsResult.snapshots;
      usage = usageResult.usage;
      totalCost = usageResult.total_cost_usd;
      lastLoadedAt = Date.now();
    } catch {
      error = 'Failed to load stats.';
      snapshots = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadStats();

    const interval = setInterval(loadStats, 5 * 60 * 1000);

    function onVisibility() {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt > 2 * 60 * 1000) {
        loadStats();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
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
    {:else}
      <div class="flex flex-col gap-5">
        {#if snapshots.length === 0}
          <div class="flex flex-col items-center justify-center gap-2 py-16">
            <Icon icon="solar:chart-square-bold-duotone" class="size-8 text-zinc-300" />
            <span class="text-sm text-zinc-400">No stats yet. Ingest some events first.</span>
          </div>
        {:else}
          <SummaryCards {snapshots} window={activeWindow} />

          <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
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
        {/if}

        <Card class="rounded-[24px] border-zinc-200/80 p-5 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
          <div class="mb-4 flex items-center gap-2">
            <Icon icon="solar:chart-2-bold-duotone" class="size-4 text-zinc-500" />
            <span class="text-sm font-semibold text-zinc-900">Token Usage</span>
          </div>
          {#if usage.length === 0}
            <div class="flex flex-col items-center gap-2 py-8 text-center">
              <Icon icon="solar:chart-2-bold-duotone" class="size-8 text-zinc-300" />
              <span class="text-sm text-zinc-400">No token usage recorded yet. Send a chat message to start tracking.</span>
            </div>
          {:else}
            <div class="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-100">
              {#each usage as row}
                <div class="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex min-w-0 items-center gap-2.5">
                    <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-xl {usageIconClass(row.kind)}">
                      <Icon icon={usageIcon(row.kind)} class="size-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="truncate font-mono text-sm text-zinc-900">{row.model}</p>
                      <p class="text-xs text-zinc-400">{row.calls} {row.calls === 1 ? 'call' : 'calls'}</p>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-4 text-right sm:justify-end sm:gap-6">
                    <div>
                      <p class="font-mono text-sm text-zinc-700">{formatTokens(row.input_tokens + row.output_tokens)}</p>
                      <p class="text-xs text-zinc-400">
                        {#if row.kind === 'llm'}
                          {formatTokens(row.input_tokens)} in · {formatTokens(row.output_tokens)} out
                        {:else}
                          total tokens
                        {/if}
                      </p>
                    </div>
                    <div class="w-20">
                      <p class="font-mono text-sm font-medium {row.cost_usd > 0 ? 'text-zinc-900' : 'text-zinc-400'}">{formatCost(row.cost_usd)}</p>
                      <p class="text-xs text-zinc-400">estimated</p>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="mt-4 flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3">
              <span class="text-sm font-medium text-zinc-500">Total estimated cost</span>
              <span class="font-mono text-sm font-semibold text-zinc-900">{formatCost(totalCost)}</span>
            </div>
          {/if}
        </Card>
      </div>
    {/if}
  </div>
</div>
