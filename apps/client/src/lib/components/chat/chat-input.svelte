<script lang="ts">
  import { chatState } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import Icon from '@iconify/svelte';

  let {
    onsend,
    placeholder = 'Ask about your team, deployments, incidents...',
  }: {
    onsend: () => void;
    placeholder?: string;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onsend();
    }
  }
</script>

<div class="border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
  <div class="mx-auto flex max-w-2xl items-center gap-2">
    <input
      type="text"
      {placeholder}
      bind:value={chatState.input}
      onkeydown={handleKeydown}
      disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
      class="h-[52px] flex-1 rounded-full border border-border bg-muted px-5 text-[15px] text-foreground placeholder:text-muted-foreground shadow-inner focus:outline-none focus:ring-2 focus:ring-ring/10 disabled:opacity-50"
    />
    <Button
      onclick={onsend}
      disabled={chatState.pending || chatState.streaming || chatState.loadingHistory || !chatState.input.trim()}
      class="h-[52px] shrink-0 rounded-full px-6"
    >
      <span class="inline-flex items-center gap-2">
        <Icon
          icon={chatState.pending || chatState.streaming
            ? 'solar:hourglass-linear'
            : 'solar:plain-2-linear'}
          class="size-4"
        />
        {chatState.pending || chatState.streaming ? 'Thinking' : 'Send'}
      </span>
    </Button>
  </div>
</div>
