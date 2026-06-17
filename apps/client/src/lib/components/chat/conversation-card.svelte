<script lang="ts">
  import type { ChatSessionSummary } from '$lib/api';
  import { chatState } from '$lib/stores';
  import Icon from '@iconify/svelte';

  let {
    session,
    onopen,
    ondelete,
  }: {
    session: ChatSessionSummary;
    onopen: (id: string) => void;
    ondelete: (event: MouseEvent, id: string) => void;
  } = $props();

  function formatConversationDate(iso: string) {
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[24px] border border-border bg-background/88 p-2 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.28)] backdrop-blur">
  <button
    type="button"
    class="flex min-w-0 flex-col items-start rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-accent"
    onclick={() => onopen(session.id)}
    disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
  >
    <div class="flex w-full items-start justify-between gap-3">
      <span class="card-title text-sm font-medium text-foreground">{session.title}</span>
      <span class="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{formatConversationDate(session.updated_at)}</span>
    </div>
    {#if session.preview}
      <span class="card-preview mt-2 text-sm text-muted-foreground">{session.preview}</span>
    {/if}
    <span class="mt-3 text-[11px] text-muted-foreground">{session.message_count} messages</span>
  </button>

  <button
    type="button"
    class="inline-flex min-h-11 min-w-11 items-center justify-center self-start rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    onclick={(e) => ondelete(e, session.id)}
    disabled={chatState.deletingSessionId === session.id || chatState.pending || chatState.streaming}
    aria-label={`Delete ${session.title}`}
  >
    {#if chatState.deletingSessionId === session.id}
      <Icon icon="solar:hourglass-linear" class="size-4" />
    {:else}
      <Icon icon="solar:trash-bin-trash-linear" class="size-4" />
    {/if}
  </button>
</div>

<style>
  .card-title,
  .card-preview {
    display: -webkit-box;
    overflow: hidden;
    word-break: break-word;
    -webkit-box-orient: vertical;
  }

  .card-title {
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }

  .card-preview {
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }
</style>
