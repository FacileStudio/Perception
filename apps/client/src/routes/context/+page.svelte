<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type EventRow } from '$lib/api';
  import { eventsState } from '$lib/stores';
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import EventDetailPane from '$lib/components/EventDetailPane.svelte';

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

  let deletingIds = $state(new Set<string>());
  let selectedEvent = $state<EventRow | null>(null);

  async function deleteEvent(id: string) {
    deletingIds = new Set([...deletingIds, id]);
    try {
      await api.events.delete(id);
      eventsState.events = eventsState.events.filter((e) => e.id !== id);
      eventsState.total = Math.max(0, eventsState.total - 1);
    } catch {
      // silently keep the item in the list on failure
    } finally {
      deletingIds = new Set([...deletingIds].filter((x) => x !== id));
    }
  }

  function onEventDeleted(id: string) {
    eventsState.events = eventsState.events.filter((e) => e.id !== id);
    eventsState.total = Math.max(0, eventsState.total - 1);
  }
</script>

<svelte:head>
  <title>{buildTitle('Context')}</title>
  <meta name="description" content="Inspect the event stream, filters, and quality signals feeding Perception." />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label class="relative block w-full max-w-sm">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          <Icon icon="solar:magnifer-linear" class="size-4" />
        </span>
        <Input
          placeholder="Search events..."
          bind:value={eventsState.query}
          oninput={onFilterChange}
          class="h-11 !rounded-full bg-muted pl-10"
        />
      </label>
      <Select
        type="single"
        value={eventsState.qualityFilter}
        onValueChange={(v) => { eventsState.qualityFilter = v ?? ''; onFilterChange(); }}
      >
        <SelectTrigger class="h-11 rounded-full px-4">
          {eventsState.qualityFilter
            ? eventsState.qualityFilter.charAt(0).toUpperCase() + eventsState.qualityFilter.slice(1)
            : 'All quality'}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All quality</SelectItem>
          <SelectItem value="complete">Complete</SelectItem>
          <SelectItem value="partial">Partial</SelectItem>
          <SelectItem value="degraded">Degraded</SelectItem>
        </SelectContent>
      </Select>
      <span class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground lg:ml-auto">
        <Icon icon="solar:database-linear" class="size-4" />
        {eventsState.total} event{eventsState.total !== 1 ? 's' : ''}
      </span>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
    {#if eventsState.loading}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-muted-foreground">Loading...</span>
      </div>
    {:else if eventsState.events.length === 0}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-muted-foreground">No events found.</span>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each eventsState.events as event}
          <Card class="cursor-pointer rounded-[24px] border-border p-4 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)] transition-shadow hover:shadow-[0_24px_56px_-36px_rgba(24,24,27,0.5)]">
            <div
              class="flex items-start justify-between gap-3"
              role="button"
              tabindex="0"
              onclick={() => (selectedEvent = event)}
              onkeydown={(e) => e.key === 'Enter' && (selectedEvent = event)}
            >
              <div class="flex flex-1 flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <Badge variant="secondary" class="font-mono">{event.provider_name}</Badge>
                  <span class="text-xs text-muted-foreground">{event.event_type}</span>
                  <span class="text-xs text-muted-foreground">{formatDate(event.occurred_at)}</span>
                </div>
                <p class="text-sm font-medium text-foreground">{event.title}</p>
                {#if event.summary}
                  <p class="text-sm text-muted-foreground">{event.summary}</p>
                {/if}
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  {#if event.quality !== 'complete'}
                    <Badge variant={qualityVariant(event.quality)}>{event.quality}</Badge>
                  {/if}
                  {#if event.entity_name}
                    <Badge variant="outline" class="font-mono">{event.entity_name}</Badge>
                  {/if}
                  {#if event.actor_name}
                    <span class="text-xs text-muted-foreground">by {event.actor_name}</span>
                  {/if}
                  {#each (event.concepts ?? []).slice(0, 4) as concept}
                    <span class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{concept}</span>
                  {/each}
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1.5" role="presentation" onclick={(e) => e.stopPropagation()}>
                {#if event.url}
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Icon icon="solar:square-top-down-linear" class="size-3.5" />
                    Open
                  </a>
                {/if}
                <button
                  onclick={() => deleteEvent(event.id)}
                  disabled={deletingIds.has(event.id)}
                  class="inline-flex items-center rounded-full border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                >
                  <Icon icon="solar:trash-bin-trash-linear" class="size-3.5" />
                </button>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>

  {#if totalPages > 1}
    <div class="border-t border-border bg-background/90 px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>Prev</Button>
        <span class="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>Next</Button>
      </div>
    </div>
  {/if}
</div>

<EventDetailPane
  event={selectedEvent}
  onclose={() => (selectedEvent = null)}
  ondelete={onEventDeleted}
/>
