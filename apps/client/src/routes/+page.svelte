<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, type ChatSessionSummary, type ChatSource } from '$lib/api';
  import { chatState, deleteChatSession, loadChatSessions, openChatSession, setActiveChatSession, startNewChat } from '$lib/stores.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Separator } from '$lib/components/ui/separator';
  import ChatMarkdown from '$lib/components/chat-markdown.svelte';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  let messagesEl = $state<HTMLDivElement | null>(null);
  let sourcesOpen = $state(false);
  let lastSources = $state<ChatSource[]>([]);

  ensureSolar();

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatSessionMeta(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatConversationDate(iso: string) {
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function buildDraftTitle(value: string) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 'New conversation';
    }
    return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized;
  }

  function currentSession(): ChatSessionSummary | null {
    return chatState.sessions.find((session) => session.id === chatState.sessionId) ?? null;
  }

  function currentSessionTitle() {
    const session = currentSession();
    if (session) {
      return session.title;
    }
    const firstUserMessage = chatState.messages.find((message) => message.role === 'user')?.content ?? '';
    return buildDraftTitle(firstUserMessage);
  }

  function currentSessionMeta() {
    const session = currentSession();
    if (session) {
      return `Updated ${formatSessionMeta(session.updated_at)} · ${chatState.messages.length} messages`;
    }
    return `Draft conversation · ${chatState.messages.length} messages`;
  }

  function hasActiveConversation() {
    return chatState.loadingHistory || chatState.messages.length > 0;
  }

  function closeSourcesPanel() {
    sourcesOpen = false;
    lastSources = [];
  }

  async function scrollToBottom() {
    await tick();
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
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
      if (!res.ok || !res.body) {
        throw new Error(`chat_failed_${res.status}`);
      }

      const sessionId = res.headers.get('X-Session-Id');
      if (sessionId) setActiveChatSession(sessionId);

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
            const parsed = JSON.parse(data) as { text?: string; error?: string; done?: boolean; sources?: ChatSource[] };
            if (parsed.error) {
              throw new Error(parsed.error);
            }
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
            if (error instanceof Error) {
              throw error;
            }
          }
        }
      }

      if (!chatState.messages[idx].content) {
        chatState.messages[idx].content = 'No response received. Please try again.';
      }

      chatState.pending = false;
      chatState.streaming = false;

      const finalMsg = chatState.messages[idx];
      if (finalMsg.sources && finalMsg.sources.length > 0) {
        lastSources = finalMsg.sources;
        sourcesOpen = true;
      }
    } catch (err) {
      chatState.pending = false;
      chatState.streaming = false;
      chatState.messages[idx].content = 'Something went wrong. Please try again.';
    }

    try {
      await loadChatSessions();
    } catch {}

    await scrollToBottom();
  }

  async function handleLaunchMessage() {
    closeSourcesPanel();
    await sendMessage();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function handleOpenConversation(sessionId: string) {
    if (chatState.pending || chatState.streaming || chatState.loadingHistory) return;
    closeSourcesPanel();
    try {
      await openChatSession(sessionId);
      await scrollToBottom();
    } catch {
      try {
        await loadChatSessions();
      } catch {}
    }
  }

  async function handleDeleteConversation(event: MouseEvent, sessionId: string) {
    event.stopPropagation();
    if (chatState.pending || chatState.streaming || chatState.deletingSessionId) return;
    await deleteChatSession(sessionId);
  }

  function handleReturnToOverview() {
    startNewChat();
    closeSourcesPanel();
  }

  function openSourcesForMessage(sources: ChatSource[]) {
    lastSources = sources;
    sourcesOpen = true;
  }

  onMount(() => {
    void (async () => {
      startNewChat();
      closeSourcesPanel();
      try {
        await loadChatSessions();
      } catch {}
    })();
  });

  $effect(() => {
    if (!hasActiveConversation()) {
      closeSourcesPanel();
    }
  });
</script>

<svelte:head>
  <title>{buildTitle('Interrogate the Noise')}</title>
  <meta name="description" content="Chat with your operational memory without digging through the rubble." />
</svelte:head>

<div class="flex h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(244,244,245,0.9))]">
  <div class="flex flex-1 flex-col">
    {#if hasActiveConversation()}
      <div class="border-b border-zinc-200/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div class="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <button
              type="button"
              class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-950"
              onclick={handleReturnToOverview}
              disabled={chatState.pending || chatState.streaming}
              aria-label="Back to conversations"
            >
              <Icon icon="solar:alt-arrow-left-linear" class="size-4" />
            </button>
            <div class="min-w-0">
              <p class="truncate font-[Goga] text-lg tracking-tight text-zinc-950">{currentSessionTitle()}</p>
              <p class="truncate text-xs text-zinc-400">{currentSessionMeta()}</p>
            </div>
          </div>
        </div>
      </div>

      <div
        bind:this={messagesEl}
        class="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {#if chatState.loadingHistory}
          <div class="flex h-full items-center justify-center">
            <div class="flex flex-col items-center gap-3 text-center">
              <span class="flex size-12 items-center justify-center rounded-3xl bg-white text-zinc-400 shadow-[0_18px_40px_-28px_rgba(24,24,27,0.32)]">
                <Icon icon="solar:refresh-bold-duotone" class="size-5 animate-spin" />
              </span>
              <p class="text-sm text-zinc-400">Loading conversation...</p>
            </div>
          </div>
        {:else}
          <div class="mx-auto flex max-w-2xl flex-col gap-4">
            {#each chatState.messages as msg, i}
              {#if msg.role === 'user'}
                <div class="flex justify-end">
                  <div class="max-w-[75%] rounded-[22px] rounded-br-md bg-zinc-950 px-4 py-3 text-sm text-white shadow-[0_18px_40px_-28px_rgba(24,24,27,0.9)]">
                    {msg.content}
                  </div>
                </div>
              {:else}
                <div class="flex justify-start">
                  <div class="max-w-[75%] rounded-[22px] rounded-bl-md border border-zinc-200/90 bg-white px-4 py-3 text-sm text-zinc-900 shadow-[0_18px_40px_-32px_rgba(24,24,27,0.35)]">
                    {#if (chatState.pending || chatState.streaming) && i === chatState.messages.length - 1 && !msg.content}
                      <span class="assistant-loader" aria-label="Assistant is typing">
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                        <span class="typing-dot"></span>
                      </span>
                    {:else}
                      <ChatMarkdown
                        content={msg.content}
                        streaming={(chatState.pending || chatState.streaming) && i === chatState.messages.length - 1}
                      />
                    {/if}
                    {#if msg.sources && msg.sources.length > 0}
                      <div class="mt-3 flex flex-wrap items-center gap-1.5">
                        {#each msg.sources as src}
                          <Badge variant="outline" class="rounded-full font-mono text-xs">
                            {src.provider_name} · {formatDate(src.occurred_at)}
                          </Badge>
                        {/each}
                        <button
                          type="button"
                          class="inline-flex min-h-8 items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                          onclick={() => openSourcesForMessage(msg.sources ?? [])}
                        >
                          <Icon icon="solar:document-text-bold-duotone" class="size-3.5" />
                          {sourcesOpen && lastSources === msg.sources ? 'Sources open' : 'Open sources'}
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      <div class="border-t border-zinc-200/80 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div class="mx-auto flex max-w-2xl items-stretch gap-3">
          <Textarea
            placeholder="Ask about your team, deployments, incidents..."
            bind:value={chatState.input}
            onkeydown={handleKeydown}
            disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
            rows={1}
            class="h-[52px] min-h-[52px] max-h-32 rounded-2xl bg-zinc-50 px-4 py-[15px] leading-5 shadow-inner"
          />
          <Button
            onclick={sendMessage}
            disabled={chatState.pending || chatState.streaming || chatState.loadingHistory || !chatState.input.trim()}
            class="h-[52px] shrink-0 rounded-2xl px-4"
          >
            <span class="inline-flex items-center gap-2">
              <Icon icon={chatState.pending || chatState.streaming ? 'solar:hourglass-bold-duotone' : 'solar:plain-2-bold-duotone'} class="size-4" />
              {chatState.pending || chatState.streaming ? 'Thinking' : 'Send'}
            </span>
          </Button>
        </div>
      </div>
    {:else}
      <ScrollArea class="flex-1 px-4 py-6 sm:px-6">
        <div class="mx-auto flex max-w-3xl flex-col gap-10 pb-8">
          <div class="flex min-h-[46dvh] items-center justify-center">
            <div class="w-full max-w-2xl rounded-[32px] border border-zinc-200/80 bg-white/92 p-5 shadow-[0_32px_90px_-52px_rgba(24,24,27,0.4)] backdrop-blur sm:p-6">
              <div class="flex flex-col gap-5">
                <div class="flex items-start gap-4">
                  <span class="flex size-14 shrink-0 items-center justify-center rounded-[24px] bg-zinc-950 text-white shadow-[0_18px_40px_-28px_rgba(24,24,27,0.9)]">
                    <Icon icon="solar:eye-bold-duotone" class="size-7" />
                  </span>
                  <div class="space-y-2">
                    <p class="font-[Goga] text-3xl tracking-tight text-zinc-950 sm:text-[2.2rem]">Interrogate the noise.</p>
                    <p class="max-w-xl text-sm leading-6 text-zinc-500 sm:text-[15px]">
                      Drop one question here to start a fresh conversation, or pick up an older thread below.
                    </p>
                  </div>
                </div>

                <div class="rounded-[28px] border border-zinc-200 bg-zinc-50/85 p-3 shadow-inner">
                  <Textarea
                    placeholder="Ask about incidents, deploys, delivery drift, or team context..."
                    bind:value={chatState.input}
                    onkeydown={handleKeydown}
                    disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
                    rows={4}
                    class="min-h-36 resize-none border-0 bg-transparent px-3 py-3 text-[15px] leading-7 shadow-none focus-visible:ring-0"
                  />
                  <div class="flex items-center justify-end border-t border-zinc-200/80 px-2 pt-3">
                    <Button
                      onclick={handleLaunchMessage}
                      disabled={chatState.pending || chatState.streaming || chatState.loadingHistory || !chatState.input.trim()}
                      class="min-h-11 rounded-2xl px-4"
                    >
                      <span class="inline-flex items-center gap-2">
                        <Icon icon={chatState.pending || chatState.streaming ? 'solar:hourglass-bold-duotone' : 'solar:plain-2-bold-duotone'} class="size-4" />
                        {chatState.pending || chatState.streaming ? 'Thinking' : 'Start chat'}
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {#if chatState.sessions.length > 0}
            <section class="flex flex-col gap-4">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-[Goga] text-2xl tracking-tight text-zinc-950">Conversation history</p>
                  <p class="text-sm text-zinc-500">Reopen an older thread, or delete the dead weight.</p>
                </div>
                {#if chatState.loadingSessions}
                  <Icon icon="solar:refresh-bold-duotone" class="size-4 animate-spin text-zinc-300" />
                {/if}
              </div>

              <div class="grid gap-3">
                {#each chatState.sessions as session}
                  <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[24px] border border-zinc-200/80 bg-white/88 p-2 shadow-[0_18px_40px_-34px_rgba(24,24,27,0.28)] backdrop-blur">
                    <button
                      type="button"
                      class="flex min-w-0 flex-col items-start rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-zinc-50"
                      onclick={() => handleOpenConversation(session.id)}
                      disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
                    >
                      <div class="flex w-full items-start justify-between gap-3">
                        <span class="conversation-card-title text-sm font-medium text-zinc-950">{session.title}</span>
                        <span class="shrink-0 pt-0.5 text-[11px] text-zinc-400">{formatConversationDate(session.updated_at)}</span>
                      </div>
                      {#if session.preview}
                        <span class="conversation-card-preview mt-2 text-sm text-zinc-500">{session.preview}</span>
                      {/if}
                      <span class="mt-3 text-[11px] text-zinc-400">{session.message_count} messages</span>
                    </button>

                    <button
                      type="button"
                      class="inline-flex min-h-11 min-w-11 items-center justify-center self-start rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
                      onclick={(event) => handleDeleteConversation(event, session.id)}
                      disabled={chatState.deletingSessionId === session.id || chatState.pending || chatState.streaming}
                      aria-label={`Delete ${session.title}`}
                    >
                      {#if chatState.deletingSessionId === session.id}
                        <Icon icon="solar:hourglass-bold-duotone" class="size-4" />
                      {:else}
                        <Icon icon="solar:trash-bin-trash-bold-duotone" class="size-4" />
                      {/if}
                    </button>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      </ScrollArea>
    {/if}
  </div>

  {#if hasActiveConversation() && sourcesOpen && lastSources.length > 0}
    <div class="fixed inset-x-4 bottom-24 top-24 z-20 flex flex-col rounded-[28px] border border-zinc-200/80 bg-white/95 shadow-[0_32px_80px_-48px_rgba(24,24,27,0.55)] xl:static xl:inset-auto xl:bottom-auto xl:top-auto xl:w-80 xl:rounded-none xl:border-0 xl:border-l xl:shadow-none">
      <div class="flex items-center justify-between px-4 py-3">
        <span class="inline-flex items-center gap-2 text-xs font-medium text-zinc-500">
          <Icon icon="solar:document-text-bold-duotone" class="size-4" />
          Sources
        </span>
        <button
          onclick={() => { sourcesOpen = false; }}
          class="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Close sources"
        >
          <Icon icon="solar:close-circle-bold-duotone" class="size-4" />
        </button>
      </div>
      <Separator />
      <ScrollArea class="flex-1 px-4 py-3">
        <div class="flex flex-col gap-3">
          {#each lastSources as src}
            <div class="flex flex-col gap-1 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3">
              <span class="text-xs font-medium text-zinc-900">{src.title}</span>
              <div class="flex items-center gap-2">
                <Badge variant="secondary">{src.provider_name}</Badge>
                <span class="text-xs text-zinc-400">{formatDate(src.occurred_at)}</span>
              </div>
              <span class="font-mono text-xs text-zinc-400">score: {src.score.toFixed(3)}</span>
            </div>
          {/each}
        </div>
      </ScrollArea>
    </div>
  {/if}
</div>

<style>
  .assistant-loader {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding-block: 0.35rem;
  }

  .typing-dot {
    display: block;
    width: 0.4rem;
    height: 0.4rem;
    flex: 0 0 auto;
    border-radius: 9999px;
    background: rgb(113 113 122);
    animation: typing-bounce 1.1s infinite ease-in-out;
  }

  .typing-dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing-dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  .conversation-card-title,
  .conversation-card-preview {
    display: -webkit-box;
    overflow: hidden;
    word-break: break-word;
    -webkit-box-orient: vertical;
  }

  .conversation-card-title {
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }

  .conversation-card-preview {
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }

  @keyframes typing-bounce {
    0%, 80%, 100% {
      transform: translateY(0);
      opacity: 0.45;
    }

    40% {
      transform: translateY(-0.22rem);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-dot {
      animation: none;
      opacity: 0.75;
    }
  }
</style>
