<script lang="ts">
  import { renderChatMarkdown } from '$lib/chat-markdown';

  type Props = {
    content: string;
    streaming?: boolean;
  };

  let { content, streaming = false }: Props = $props();
  const html = $derived(renderChatMarkdown(content));
</script>

<div class="chat-markdown text-sm text-zinc-900" aria-live={streaming ? 'polite' : undefined}>
  {@html html}
  {#if streaming}
    <span class="animate-pulse text-zinc-400">|</span>
  {/if}
</div>

<style>
  .chat-markdown {
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .chat-markdown :global(p),
  .chat-markdown :global(ul),
  .chat-markdown :global(ol),
  .chat-markdown :global(blockquote),
  .chat-markdown :global(pre),
  .chat-markdown :global(.chat-md-table),
  .chat-markdown :global(hr),
  .chat-markdown :global(h2),
  .chat-markdown :global(h3),
  .chat-markdown :global(h4) {
    margin-top: 0.85rem;
  }

  .chat-markdown :global(*:first-child) {
    margin-top: 0;
  }

  .chat-markdown :global(p) {
    white-space: normal;
  }

  .chat-markdown :global(h2),
  .chat-markdown :global(h3),
  .chat-markdown :global(h4) {
    font-family: "Goga", sans-serif;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: rgb(24 24 27);
  }

  .chat-markdown :global(h2) {
    font-size: 1rem;
  }

  .chat-markdown :global(h3),
  .chat-markdown :global(h4) {
    font-size: 0.925rem;
  }

  .chat-markdown :global(ul),
  .chat-markdown :global(ol) {
    padding-left: 1.2rem;
  }

  .chat-markdown :global(li + li) {
    margin-top: 0.35rem;
  }

  .chat-markdown :global(blockquote) {
    border-left: 2px solid rgb(228 228 231);
    padding-left: 0.85rem;
    color: rgb(82 82 91);
  }

  .chat-markdown :global(hr) {
    border: 0;
    border-top: 1px solid rgb(228 228 231);
  }

  .chat-markdown :global(a) {
    color: rgb(24 24 27);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.15em;
  }

  .chat-markdown :global(strong) {
    font-weight: 600;
  }

  .chat-markdown :global(code) {
    border-radius: 0.45rem;
    background: rgb(244 244 245);
    padding: 0.12rem 0.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 0.8125rem;
  }

  .chat-markdown :global(pre) {
    overflow-x: auto;
    border-radius: 1rem;
    background: rgb(24 24 27);
    padding: 0.9rem 1rem;
  }

  .chat-markdown :global(pre code) {
    background: transparent;
    padding: 0;
    color: white;
    font-size: 0.8rem;
    line-height: 1.65;
  }

  .chat-markdown :global(.chat-md-table) {
    overflow-x: auto;
    border-radius: 1rem;
    border: 1px solid rgb(228 228 231);
    background: rgb(250 250 250);
  }

  .chat-markdown :global(table) {
    width: 100%;
    min-width: 24rem;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }

  .chat-markdown :global(th),
  .chat-markdown :global(td) {
    border-bottom: 1px solid rgb(228 228 231);
    padding: 0.65rem 0.75rem;
    text-align: left;
    vertical-align: top;
  }

  .chat-markdown :global(th) {
    font-weight: 600;
    color: rgb(39 39 42);
  }

  .chat-markdown :global(tr:last-child td) {
    border-bottom: 0;
  }
</style>
