<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, type ChatMessage, type ChatSource } from '$lib/api';
  import { chatState } from '$lib/stores.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Separator } from '$lib/components/ui/separator';

  let messagesEl: HTMLDivElement;
  let sourcesOpen = $state(false);
  let lastSources = $state<ChatSource[]>([]);

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
    if (!text || chatState.streaming) return;

    chatState.messages.push({ role: 'user', content: text });
    chatState.input = '';
    await scrollToBottom();

    try {
      const res = await api.chat.send(text, chatState.sessionId ?? undefined);

      const sessionId = res.headers.get('X-Session-Id');
      if (sessionId) chatState.sessionId = sessionId;

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      chatState.messages.push({ role: 'assistant', content: '' });
      const idx = chatState.messages.length - 1;
      chatState.streaming = true;

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
            const parsed = JSON.parse(data) as { text?: string; error?: string };
            if (parsed.text) {
              chatState.messages[idx].content += parsed.text;
              await scrollToBottom();
            }
          } catch { /* partial chunk */ }
        }
      }

      chatState.streaming = false;

      const finalMsg = chatState.messages[idx];
      if (finalMsg.sources && finalMsg.sources.length > 0) {
        lastSources = finalMsg.sources;
        sourcesOpen = true;
      }
    } catch (err) {
      chatState.streaming = false;
      chatState.messages.push({ role: 'assistant', content: 'Something went wrong. Please try again.' });
    }

    await scrollToBottom();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  onMount(() => {
    scrollToBottom();
  });
</script>

<div class="flex h-full">
  <div class="flex flex-1 flex-col">
    <div
      bind:this={messagesEl}
      class="flex-1 overflow-y-auto px-4 py-6"
    >
      {#if chatState.messages.length === 0}
        <div class="flex h-full items-center justify-center">
          <p class="text-sm text-zinc-400">Ask anything about your operational context.</p>
        </div>
      {:else}
        <div class="mx-auto flex max-w-2xl flex-col gap-4">
          {#each chatState.messages as msg, i}
            {#if msg.role === 'user'}
              <div class="flex justify-end">
                <div class="max-w-[75%] rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
                  {msg.content}
                </div>
              </div>
            {:else}
              <div class="flex justify-start">
                <div class="max-w-[75%] rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900">
                  <span class="whitespace-pre-wrap">{msg.content}</span>{#if chatState.streaming && i === chatState.messages.length - 1}<span class="animate-pulse">|</span>{/if}
                  {#if msg.sources && msg.sources.length > 0}
                    <div class="mt-2 flex flex-wrap gap-1">
                      {#each msg.sources as src}
                        <Badge variant="outline" class="font-mono text-xs">
                          {src.provider_name} · {formatDate(src.occurred_at)}
                        </Badge>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>

    <div class="border-t border-zinc-200 bg-white px-4 py-3">
      <div class="mx-auto flex max-w-2xl items-end gap-2">
        <Textarea
          placeholder="Ask about your team, deployments, incidents..."
          bind:value={chatState.input}
          onkeydown={handleKeydown}
          disabled={chatState.streaming}
          class="min-h-[44px] max-h-32"
        />
        <Button
          onclick={sendMessage}
          disabled={chatState.streaming || !chatState.input.trim()}
          class="shrink-0"
        >
          {chatState.streaming ? '...' : 'Send'}
        </Button>
      </div>
    </div>
  </div>

  {#if sourcesOpen && lastSources.length > 0}
    <div class="flex w-72 flex-col border-l border-zinc-200 bg-white">
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-xs font-medium text-zinc-600">Sources</span>
        <button
          onclick={() => { sourcesOpen = false; }}
          class="text-xs text-zinc-400 hover:text-zinc-600"
        >
          close
        </button>
      </div>
      <Separator />
      <ScrollArea class="flex-1 px-4 py-3">
        <div class="flex flex-col gap-3">
          {#each lastSources as src}
            <div class="flex flex-col gap-1">
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
