<script lang="ts">
  import { chatState } from '$lib/stores';
  import { api, type ChatSource, type ChatMessage } from '$lib/api';
  import ChatMarkdown from '$lib/components/chat-markdown.svelte';
  import TypingIndicator from './typing-indicator.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import Icon from '@iconify/svelte';

  let {
    messagesEl = $bindable<HTMLDivElement | null>(null),
    sourcesOpen,
    lastSources,
    onopensources,
  }: {
    messagesEl?: HTMLDivElement | null;
    sourcesOpen: boolean;
    lastSources: ChatSource[];
    onopensources: (msg: ChatMessage) => void;
  } = $props();

  let expandedSql = $state<string | null>(null);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div bind:this={messagesEl} class="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
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
                <TypingIndicator />
              {:else}
                <ChatMarkdown
                  content={msg.content}
                  streaming={(chatState.pending || chatState.streaming) && i === chatState.messages.length - 1}
                />
              {/if}
              {#if msg.sql_query}
                <div class="mt-2.5">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors {expandedSql === msg.id ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
                    onclick={() => expandedSql = expandedSql === msg.id ? null : (msg.id ?? null)}
                  >
                    <Icon icon="solar:database-bold-duotone" class="size-3.5" />
                    SQL query · {msg.sql_query.row_count} {msg.sql_query.row_count === 1 ? 'row' : 'rows'}
                  </button>
                  {#if expandedSql === msg.id && msg.sql_query}
                    <pre class="mt-1.5 overflow-x-auto rounded-xl bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-300">{msg.sql_query.query}</pre>
                  {/if}
                </div>
              {/if}
              {#if msg.community_summaries && msg.community_summaries.length > 0}
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {#each msg.community_summaries as cs}
                    <span class="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700" title={cs.summary}>
                      <Icon icon="solar:graph-bold-duotone" class="size-3" />
                      {cs.title}
                    </span>
                  {/each}
                </div>
              {/if}
              {#if msg.sources && msg.sources.length > 0}
                <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {#each msg.sources as src}
                    <Badge variant="outline" class="rounded-full font-mono text-xs">
                      {src.provider_name} · {formatDate(src.occurred_at)}
                    </Badge>
                  {/each}
                  <button
                    type="button"
                    class="inline-flex min-h-8 items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                    onclick={() => onopensources(msg)}
                  >
                    <Icon icon="solar:document-text-bold-duotone" class="size-3.5" />
                    {sourcesOpen ? 'Sources open' : 'Open sources'}
                  </button>
                </div>
              {/if}
              {#if msg.role === 'assistant' && msg.id}
                <div class="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded-full p-1 transition-colors {msg.feedback === 'up' ? 'text-emerald-500' : 'text-zinc-300 hover:text-zinc-500'}"
                    onclick={async () => {
                      const newFeedback = msg.feedback === 'up' ? null : 'up';
                      msg.feedback = newFeedback;
                      await api.chat.feedback(msg.id!, newFeedback);
                    }}
                  >
                    <Icon icon="solar:like-bold-duotone" class="size-4" />
                  </button>
                  <button
                    type="button"
                    class="rounded-full p-1 transition-colors {msg.feedback === 'down' ? 'text-red-400' : 'text-zinc-300 hover:text-zinc-500'}"
                    onclick={async () => {
                      const newFeedback = msg.feedback === 'down' ? null : 'down';
                      msg.feedback = newFeedback;
                      await api.chat.feedback(msg.id!, newFeedback);
                    }}
                  >
                    <Icon icon="solar:dislike-bold-duotone" class="size-4" />
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
