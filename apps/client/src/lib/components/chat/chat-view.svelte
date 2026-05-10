<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import type { ChatSource, ChatMessage } from '$lib/api';
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
  let lastMessage = $state<ChatMessage | null>(null);

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
      const latestAssistant = chatState.messages.filter((m) => m.role === 'assistant').at(-1) ?? null;
      lastMessage = latestAssistant;
      sourcesOpen = true;
    }
  }

  function handleBack() {
    startNewChat();
    sourcesOpen = false;
    lastSources = [];
    lastMessage = null;
    goto('/');
  }

  function openSourcesForMessage(msg: ChatMessage) {
    lastSources = msg.sources ?? [];
    lastMessage = msg;
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

  {#if sourcesOpen && (lastSources.length > 0 || lastMessage?.sql_query || lastMessage?.community_summaries?.length)}
    <ChatSources sources={lastSources} message={lastMessage} onclose={() => { sourcesOpen = false; }} />
  {/if}
</div>
