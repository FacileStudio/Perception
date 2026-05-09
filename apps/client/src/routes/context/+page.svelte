<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type EventRow } from '$lib/api';
  import { eventsState } from '$lib/stores';
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  const PAGE_SIZE = 20;
  let page = $state(1);

  ensureSolar();

  function qualityVariant(q: Exclude<EventRow['quality'], 'complete'>): 'outline' | 'secondary' {
    if (q === 'partial') return 'outline';
    return 'secondary';
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  async function loadEvents() {
    eventsState.loading = true;
    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      };
      if (eventsState.query) params.q = eventsState.query;
      if (eventsState.providerFilter) params.provider_type = eventsState.providerFilter;
      if (eventsState.qualityFilter) params.quality = eventsState.qualityFilter;

      const result = await api.events.list(params);
      eventsState.events = result.events;
      eventsState.total = result.total;
    } catch {
      eventsState.events = [];
      eventsState.total = 0;
    } finally {
      eventsState.loading = false;
    }
  }

  function onFilterChange() {
    page = 1;
    loadEvents();
  }

  function prevPage() {
    if (page > 1) { page -= 1; loadEvents(); }
  }

  function nextPage() {
    if (page * PAGE_SIZE < eventsState.total) { page += 1; loadEvents(); }
  }

  onMount(() => loadEvents());

  const totalPages = $derived(Math.ceil(eventsState.total / PAGE_SIZE));

  const labelingIds = $state(new Set<string>());
  let labelingAll = $state(false);
  let labeledCount = $state<number | null>(null);
  let resolvingEntities = $state(false);
  let resolvedCount = $state<number | null>(null);

  async function labelEvent(event: import('$lib/api').EventRow) {
    labelingIds.add(event.id);
    try {
      await api.events.label(event.id);
      await loadEvents();
    } finally {
      labelingIds.delete(event.id);
    }
  }

  async function labelAllUnlabeled() {
    labelingAll = true;
    labeledCount = null;
    try {
      const result = await api.events.labelUnlabeled();
      labeledCount = result.labeled;
      await loadEvents();
    } finally {
      labelingAll = false;
    }
  }

  async function resolveEntities() {
    resolvingEntities = true;
    resolvedCount = null;
    try {
      const result = await api.events.resolveEntities();
      resolvedCount = result.resolved;
      await loadEvents();
    } finally {
      resolvingEntities = false;
    }
  }
</script>

<svelte:head>
  <title>{buildTitle('Context')}</title>
  <meta name="description" content="Inspect the event stream, filters, and quality signals feeding Perception." />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label class="relative block w-full max-w-sm">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <Icon icon="solar:magnifer-bold-duotone" class="size-4" />
        </span>
        <Input
          placeholder="Search events..."
          bind:value={eventsState.query}
          oninput={onFilterChange}
          class="h-11 rounded-full bg-zinc-50 pl-10"
        />
      </label>
      <Input
        placeholder="Provider (e.g. github)"
        bind:value={eventsState.providerFilter}
        oninput={onFilterChange}
        class="h-11 rounded-full bg-zinc-50 w-40"
      />
      <select
        bind:value={eventsState.qualityFilter}
        onchange={onFilterChange}
        class="h-11 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
      >
        <option value="">All quality</option>
        <option value="complete">Complete</option>
        <option value="partial">Partial</option>
        <option value="degraded">Degraded</option>
      </select>
      <span class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-zinc-400 lg:ml-auto">
        <Icon icon="solar:database-bold-duotone" class="size-4" />
        {eventsState.total} event{eventsState.total !== 1 ? 's' : ''}
      </span>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
    {#if eventsState.loading}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">Loading...</span>
      </div>
    {:else if eventsState.events.length === 0}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">No events found.</span>
      </div>
    {:else}
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button
          onclick={labelAllUnlabeled}
          disabled={labelingAll || resolvingEntities}
          class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 shadow-sm transition-colors hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50"
        >
          {#if labelingAll}
            <Icon icon="solar:refresh-bold-duotone" class="size-3.5 animate-spin" />
            Labeling…
          {:else}
            <Icon icon="solar:tags-bold-duotone" class="size-3.5" />
            Label all unlabeled
          {/if}
        </button>
        {#if labeledCount !== null}
          <span class="text-xs text-zinc-400">{labeledCount} labeled</span>
        {/if}
        <button
          onclick={resolveEntities}
          disabled={resolvingEntities || labelingAll}
          class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 shadow-sm transition-colors hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50"
        >
          {#if resolvingEntities}
            <Icon icon="solar:refresh-bold-duotone" class="size-3.5 animate-spin" />
            Resolving…
          {:else}
            <Icon icon="solar:link-round-bold-duotone" class="size-3.5" />
            Resolve missing relations
          {/if}
        </button>
        {#if resolvedCount !== null}
          <span class="text-xs text-zinc-400">{resolvedCount} resolved</span>
        {/if}
      </div>
      <div class="flex flex-col gap-3">
        {#each eventsState.events as event}
          <Card class="rounded-[24px] border-zinc-200/80 p-4 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
            <div class="flex items-start justify-between gap-3">
              <div class="flex flex-1 flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <Badge variant="secondary" class="font-mono">{event.provider_name}</Badge>
                  <span class="text-xs text-zinc-500">{event.event_type}</span>
                  <span class="text-xs text-zinc-400">{formatDate(event.occurred_at)}</span>
                </div>
                <p class="text-sm font-medium text-zinc-900">{event.title}</p>
                {#if event.summary}
                  <p class="text-sm text-zinc-500">{event.summary}</p>
                {/if}
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  {#if event.quality !== 'complete'}
                    <Badge variant={qualityVariant(event.quality)}>{event.quality}</Badge>
                  {/if}
                  {#if event.entity_name}
                    <Badge variant="outline" class="font-mono">{event.entity_name}</Badge>
                  {/if}
                  {#if event.actor_name}
                    <span class="text-xs text-zinc-400">by {event.actor_name}</span>
                  {/if}
                  {#each (event.concepts ?? []).slice(0, 4) as concept}
                    <span class="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-400">{concept}</span>
                  {/each}
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                {#if !event.concepts?.length}
                  <button
                    onclick={() => labelEvent(event)}
                    disabled={labelingIds.has(event.id) || labelingAll}
                    class="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600 disabled:opacity-40"
                  >
                    <Icon
                      icon={labelingIds.has(event.id) ? 'solar:refresh-bold-duotone' : 'solar:tag-bold-duotone'}
                      class="size-3.5 {labelingIds.has(event.id) ? 'animate-spin' : ''}"
                    />
                    {labelingIds.has(event.id) ? 'Labeling…' : 'Label'}
                  </button>
                {/if}
                {#if event.url}
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <Icon icon="solar:square-top-down-bold-duotone" class="size-3.5" />
                    Open
                  </a>
                {/if}
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>

  {#if totalPages > 1}
    <div class="border-t border-zinc-200/80 bg-white/90 px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>Prev</Button>
        <span class="text-xs text-zinc-500">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>Next</Button>
      </div>
    </div>
  {/if}
</div>
