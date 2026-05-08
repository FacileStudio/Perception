<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, type ChatSource } from '$lib/api';
  import { chatState } from '$lib/stores.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Separator } from '$lib/components/ui/separator';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  let messagesEl: HTMLDivElement;
  let sourcesOpen = $state(false);
  let lastSources = $state<ChatSource[]>([]);

  ensureSolar();

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function scrollToBottom() {
    await tick();
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  async function sendMessage() {
    const text = chatState.input.trim();
    if (!text || chatState.pending || chatState.streaming) return;

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
      if (sessionId) chatState.sessionId = sessionId;

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

    await scrollToBottom();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function openSourcesForMessage(sources: ChatSource[]) {
    lastSources = sources;
    sourcesOpen = true;
  }

  onMount(() => {
    scrollToBottom();
  });
</script>

<svelte:head>
  <title>{buildTitle('Interrogate the Noise')}</title>
  <meta name="description" content="Chat with your operational memory without digging through the rubble." />
</svelte:head>

<div class="flex h-full bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(244,244,245,0.9))]">
  <div class="flex flex-1 flex-col">
    <div
      bind:this={messagesEl}
      class="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
    >
      {#if chatState.messages.length === 0}
        <div class="flex h-full items-center justify-center">
          <div class="flex max-w-md flex-col items-center gap-4 px-8 py-10 text-center">
            <span class="flex size-14 items-center justify-center rounded-3xl bg-zinc-950 text-white">
              <Icon icon="solar:eye-bold-duotone" class="size-7" />
            </span>
            <div class="space-y-2">
              <p class="font-[Goga] text-2xl tracking-tight text-zinc-950">See the shape of the chaos.</p>
              <p class="text-sm leading-6 text-zinc-500">Ask about incidents, deploys, delivery drift, or team context. Perception digs through the mess so you do not.</p>
            </div>
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
                    <span class="whitespace-pre-wrap">{msg.content}</span>{#if (chatState.pending || chatState.streaming) && i === chatState.messages.length - 1}<span class="animate-pulse">|</span>{/if}
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
          disabled={chatState.pending || chatState.streaming}
          rows={1}
          class="h-[52px] min-h-[52px] max-h-32 rounded-2xl bg-zinc-50 px-4 py-[15px] leading-5 shadow-inner"
        />
        <Button
          onclick={sendMessage}
          disabled={chatState.pending || chatState.streaming || !chatState.input.trim()}
          class="h-[52px] shrink-0 rounded-2xl px-4"
        >
          <span class="inline-flex items-center gap-2">
            <Icon icon={chatState.pending || chatState.streaming ? 'solar:hourglass-bold-duotone' : 'solar:plain-2-bold-duotone'} class="size-4" />
            {chatState.pending || chatState.streaming ? 'Thinking' : 'Send'}
          </span>
        </Button>
      </div>
    </div>
  </div>

  {#if sourcesOpen && lastSources.length > 0}
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
