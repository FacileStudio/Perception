<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type EventRow } from '$lib/api';
  import { eventsState } from '$lib/stores.svelte';
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';

  const PAGE_SIZE = 20;
  let page = $state(1);

  function qualityVariant(q: EventRow['quality']): 'default' | 'outline' | 'secondary' {
    if (q === 'complete') return 'default';
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
</script>

<div class="flex h-full flex-col">
  <div class="border-b border-zinc-200 bg-white px-6 py-4">
    <div class="flex items-center gap-3">
      <Input
        placeholder="Search events..."
        bind:value={eventsState.query}
        oninput={onFilterChange}
        class="max-w-xs"
      />
      <select
        bind:value={eventsState.providerFilter}
        onchange={onFilterChange}
        class="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
      >
        <option value="">All providers</option>
        <option value="github">GitHub</option>
        <option value="gitlab">GitLab</option>
        <option value="linear">Linear</option>
        <option value="slack">Slack</option>
        <option value="pagerduty">PagerDuty</option>
      </select>
      <select
        bind:value={eventsState.qualityFilter}
        onchange={onFilterChange}
        class="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
      >
        <option value="">All quality</option>
        <option value="complete">Complete</option>
        <option value="partial">Partial</option>
        <option value="degraded">Degraded</option>
      </select>
      <span class="ml-auto text-xs text-zinc-400">
        {eventsState.total} event{eventsState.total !== 1 ? 's' : ''}
      </span>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-6 py-4">
    {#if eventsState.loading}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">Loading...</span>
      </div>
    {:else if eventsState.events.length === 0}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">No events found.</span>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each eventsState.events as event}
          <Card class="p-4">
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
                <div class="flex items-center gap-2 pt-1">
                  <Badge variant={qualityVariant(event.quality)}>{event.quality}</Badge>
                  {#if event.entity_name}
                    <Badge variant="outline" class="font-mono">{event.entity_name}</Badge>
                  {/if}
                  {#if event.actor_name}
                    <span class="text-xs text-zinc-400">by {event.actor_name}</span>
                  {/if}
                </div>
              </div>
              {#if event.url}
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 text-xs text-zinc-400 hover:text-zinc-600 hover:underline"
                >
                  ↗
                </a>
              {/if}
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>

  {#if totalPages > 1}
    <div class="border-t border-zinc-200 bg-white px-6 py-3">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>Prev</Button>
        <span class="text-xs text-zinc-500">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>Next</Button>
      </div>
    </div>
  {/if}
</div>
