<script lang="ts">
  import { renderChatMarkdown } from '$lib/chat-markdown';

  type Props = {
    content: string;
    streaming?: boolean;
  };

  let { content, streaming = false }: Props = $props();
  const html = $derived(renderChatMarkdown(content));
</script>

<div class="chat-markdown text-sm text-foreground" aria-live={streaming ? 'polite' : undefined}>
  {@html html}
  {#if streaming}
    <span class="animate-pulse text-muted-foreground">|</span>
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
    font-weight: 600;
    letter-spacing: -0.02em;
    color: hsl(var(--foreground));
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
    border-left: 2px solid hsl(var(--border));
    padding-left: 0.85rem;
    color: hsl(var(--muted-foreground));
  }

  .chat-markdown :global(hr) {
    border: 0;
    border-top: 1px solid hsl(var(--border));
  }

  .chat-markdown :global(a) {
    color: hsl(var(--foreground));
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.15em;
  }

  .chat-markdown :global(strong) {
    font-weight: 600;
  }

  .chat-markdown :global(code) {
    border-radius: 0.45rem;
    background: hsl(var(--muted));
    padding: 0.12rem 0.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 0.8125rem;
  }

  .chat-markdown :global(pre) {
    overflow-x: auto;
    border-radius: 1rem;
    background: hsl(var(--foreground));
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
    border: 1px solid hsl(var(--border));
    background: hsl(var(--secondary));
  }

  .chat-markdown :global(table) {
    width: 100%;
    min-width: 24rem;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }

  .chat-markdown :global(th),
  .chat-markdown :global(td) {
    border-bottom: 1px solid hsl(var(--border));
    padding: 0.65rem 0.75rem;
    text-align: left;
    vertical-align: top;
  }

  .chat-markdown :global(th) {
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .chat-markdown :global(tr:last-child td) {
    border-bottom: 0;
  }
</style>
