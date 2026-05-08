<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import type { ChatSource } from '$lib/api';
  import { chatState, sendChatMessage, startNewChat } from '$lib/stores';
  import ChatHeader from './chat-header.svelte';
  import ChatMessages from './chat-messages.svelte';
  import ChatInput from './chat-input.svelte';
  import ChatSources from './chat-sources.svelte';

  let {
    autosend = false,
  }: {
    autosend?: boolean;
  } = $props();

  let messagesEl = $state<HTMLDivElement | null>(null);
  let sourcesOpen = $state(false);
  let lastSources = $state<ChatSource[]>([]);

  $effect(() => {
    void chatState.messages.map((m) => m.content);
    void tick().then(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  });

  onMount(() => {
    if (autosend && chatState.input.trim()) {
      void send();
    }
  });

  function currentSessionTitle() {
    const session = chatState.sessions.find((s) => s.id === chatState.sessionId);
    if (session) return session.title;
    const firstUser = chatState.messages.find((m) => m.role === 'user')?.content ?? '';
    const normalized = firstUser.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'New conversation';
    return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized;
  }

  function currentSessionMeta() {
    const session = chatState.sessions.find((s) => s.id === chatState.sessionId);
    if (session) {
      return `Updated ${new Date(session.updated_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })} · ${chatState.messages.length} messages`;
    }
    return `Draft conversation · ${chatState.messages.length} messages`;
  }

  async function send() {
    const currentPath = $page.url.pathname;
    const { sessionId, sources } = await sendChatMessage();
    if (sessionId && currentPath !== `/chat/${sessionId}`) {
      replaceState(`/chat/${sessionId}`, {});
    }
    if (sources.length) {
      lastSources = sources;
      sourcesOpen = true;
    }
  }

  function handleBack() {
    startNewChat();
    sourcesOpen = false;
    lastSources = [];
    goto('/');
  }

  function openSourcesForMessage(sources: ChatSource[]) {
    lastSources = sources;
    sourcesOpen = true;
  }
</script>

<div class="flex h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(244,244,245,0.9))]">
  <div class="flex flex-1 flex-col">
    <ChatHeader
      title={currentSessionTitle()}
      meta={currentSessionMeta()}
      onback={handleBack}
      disabled={chatState.pending || chatState.streaming}
    />
    <ChatMessages
      bind:messagesEl
      {sourcesOpen}
      {lastSources}
      onopensources={openSourcesForMessage}
    />
    <ChatInput onsend={send} />
  </div>

  {#if sourcesOpen && lastSources.length > 0}
    <ChatSources sources={lastSources} onclose={() => { sourcesOpen = false; }} />
  {/if}
</div>
