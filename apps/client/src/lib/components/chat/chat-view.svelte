<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { api, type ChatSource } from '$lib/api';
  import { chatState, loadChatSessions, setActiveChatSession, startNewChat } from '$lib/stores.svelte';
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

  onMount(async () => {
    if (autosend && chatState.input.trim()) {
      await sendMessage();
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

  async function scrollToBottom() {
    await tick();
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage() {
    const text = chatState.input.trim();
    if (!text || chatState.pending || chatState.streaming || chatState.loadingHistory) return;

    chatState.messages.push({ role: 'user', content: text });
    chatState.messages.push({ role: 'assistant', content: '' });
    const idx = chatState.messages.length - 1;
    chatState.input = '';
    chatState.pending = true;
    await scrollToBottom();

    try {
      const res = await api.chat.send(text, chatState.sessionId ?? undefined);
      if (!res.ok || !res.body) throw new Error(`chat_failed_${res.status}`);

      const sessionId = res.headers.get('X-Session-Id');
      if (sessionId) {
        setActiveChatSession(sessionId);
        if ($page.url.pathname === '/chat') {
          replaceState(`/chat/${sessionId}`, {});
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data) as {
              text?: string;
              error?: string;
              done?: boolean;
              sources?: ChatSource[];
            };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              chatState.pending = false;
              chatState.streaming = true;
              chatState.messages[idx].content += parsed.text;
              await scrollToBottom();
            }
            if (parsed.sources?.length) {
              chatState.messages[idx].sources = parsed.sources;
            }
          } catch (error) {
            if (error instanceof Error) throw error;
          }
        }
      }

      if (!chatState.messages[idx].content) {
        chatState.messages[idx].content = 'No response received. Please try again.';
      }

      chatState.pending = false;
      chatState.streaming = false;

      const finalMsg = chatState.messages[idx];
      if (finalMsg.sources?.length) {
        lastSources = finalMsg.sources;
        sourcesOpen = true;
      }
    } catch {
      chatState.pending = false;
      chatState.streaming = false;
      chatState.messages[idx].content = 'Something went wrong. Please try again.';
    }

    try {
      await loadChatSessions();
    } catch {}

    await scrollToBottom();
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
    <ChatInput onsend={sendMessage} />
  </div>

  {#if sourcesOpen && lastSources.length > 0}
    <ChatSources sources={lastSources} onclose={() => { sourcesOpen = false; }} />
  {/if}
</div>
