<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { api, type EventRow } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import Icon from '@iconify/svelte';

  let {
    event,
    onclose,
    ondelete,
  }: {
    event: EventRow | null;
    onclose: () => void;
    ondelete: (id: string) => void;
  } = $props();

  let detail = $state<{
    facts: Record<string, unknown> | null;
    embedding: { status: string; embedded_at: string | null } | null;
  } | null>(null);
  let loadingDetail = $state(false);
  let deleting = $state(false);

  $effect(() => {
    if (event) {
      detail = null;
      loadingDetail = true;
      api.events
        .get(event.id)
        .then((d) => {
          detail = { facts: d.facts, embedding: d.embedding };
        })
        .catch(() => {})
        .finally(() => {
          loadingDetail = false;
        });
    }
  });

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function qualityVariant(q: EventRow['quality']): 'outline' | 'secondary' | 'default' {
    if (q === 'complete') return 'default';
    if (q === 'partial') return 'outline';
    return 'secondary';
  }

  async function handleDelete() {
    if (!event || deleting) return;
    deleting = true;
    try {
      await api.events.delete(event.id);
      ondelete(event.id);
      onclose();
    } catch {
      deleting = false;
    }
  }
</script>

{#if event}
  <div
    class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
    role="presentation"
    onclick={onclose}
    transition:fade={{ duration: 150 }}
  ></div>

  <div
    class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background"
    in:fly={{ x: 420, duration: 280, easing: cubicOut }}
    out:fly={{ x: 420, duration: 200, easing: cubicOut }}
  >
    <div class="flex items-start justify-between border-b border-border/50 px-5 py-4">
      <div class="flex-1 pr-3">
        <p class="text-sm font-semibold leading-snug text-foreground">{event.title}</p>
        <div class="mt-1.5 flex items-center gap-2">
          <Badge variant="secondary" class="font-mono">{event.provider_name}</Badge>
          <span class="text-xs text-muted-foreground">{event.event_type}</span>
        </div>
      </div>
      <button
        onclick={onclose}
        class="mt-0.5 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Close"
      >
        <Icon icon="solar:close-circle-linear" class="size-4" />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-xs">
          <Icon icon="solar:calendar-linear" class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="text-muted-foreground">{formatDate(event.occurred_at)}</span>
        </div>
        {#if event.actor_name}
          <div class="flex items-center gap-2 text-xs">
            <Icon icon="solar:user-linear" class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">{event.actor_name}</span>
          </div>
        {/if}
        {#if event.entity_name}
          <div class="flex items-center gap-2 text-xs">
            <Icon icon="solar:box-linear" class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="font-mono text-muted-foreground">{event.entity_name}</span>
            {#if event.entity_type}
              <span class="text-muted-foreground">· {event.entity_type}</span>
            {/if}
          </div>
        {/if}
        {#if event.status}
          <div class="flex items-center gap-2 text-xs">
            <Icon icon="solar:flag-linear" class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">{event.status}</span>
          </div>
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Badge variant={qualityVariant(event.quality)}>{event.quality}</Badge>
        {#each event.concepts ?? [] as concept}
          <span class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            >{concept}</span
          >
        {/each}
      </div>

      {#if event.summary}
        <div>
          <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Summary
          </p>
          <p class="text-sm leading-relaxed text-muted-foreground">{event.summary}</p>
        </div>
      {/if}

      {#if loadingDetail}
        <p class="text-xs text-muted-foreground">Loading details…</p>
      {:else if detail?.facts && Object.keys(detail.facts).length > 0}
        <div>
          <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Facts</p>
          <dl class="space-y-1.5">
            {#each Object.entries(detail.facts) as [k, v]}
              <div class="flex gap-2 text-xs">
                <dt class="w-32 shrink-0 font-mono text-muted-foreground">{k}</dt>
                <dd class="break-all text-muted-foreground">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </dd>
              </div>
            {/each}
          </dl>
        </div>
      {/if}

      {#if detail?.embedding}
        <div class="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span class="font-medium text-muted-foreground">Embedding:</span>
          {detail.embedding.status}
          {#if detail.embedding.embedded_at}
            · {formatDate(detail.embedding.embedded_at)}
          {/if}
        </div>
      {/if}

      {#if event.url}
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon icon="solar:square-top-down-linear" class="size-4 shrink-0" />
          Open source
        </a>
      {/if}
    </div>

    <div class="border-t border-border/50 px-5 py-4">
      <button
        onclick={handleDelete}
        disabled={deleting}
        class="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40"
      >
        <Icon icon="solar:trash-bin-trash-linear" class="size-4" />
        {deleting ? 'Deleting…' : 'Delete event'}
      </button>
    </div>
  </div>
{/if}
