<script lang="ts">
  import { goto } from '$app/navigation';
  import { chatState, deleteChatSession } from '$lib/stores';
  import Icon from '@iconify/svelte';
  import ConversationCard from './conversation-card.svelte';

  async function handleOpen(sessionId: string) {
    if (chatState.pending || chatState.streaming || chatState.loadingHistory) return;
    goto(`/chat/${sessionId}`);
  }

  async function handleDelete(event: MouseEvent, sessionId: string) {
    event.stopPropagation();
    if (chatState.pending || chatState.streaming || chatState.deletingSessionId) return;
    await deleteChatSession(sessionId);
  }
</script>

{#if chatState.sessions.length > 0}
  <section class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-[Goga] text-2xl tracking-tight text-zinc-950">Conversation history</p>
        <p class="text-sm text-zinc-500">Reopen an older thread, or delete the dead weight.</p>
      </div>
      {#if chatState.loadingSessions}
        <Icon icon="solar:refresh-linear" class="size-4 animate-spin text-zinc-300" />
      {/if}
    </div>
    <div class="grid gap-3">
      {#each chatState.sessions as session}
        <ConversationCard {session} onopen={handleOpen} ondelete={handleDelete} />
      {/each}
    </div>
  </section>
{/if}
