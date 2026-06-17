<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chatState, loadChatSessions, startNewChat } from '$lib/stores';
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import ConversationList from '$lib/components/chat/conversation-list.svelte';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  onMount(() => {
    startNewChat();
    void loadChatSessions().catch(() => {});
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    if (!chatState.input.trim() || chatState.pending || chatState.streaming) return;
    goto('/chat/new');
  }
</script>

<svelte:head>
  <title>{buildTitle('Chat')}</title>
  <meta name="description" content="Chat with your operational memory without digging through the rubble." />
</svelte:head>

<ScrollArea class="flex-1 px-4 py-6 sm:px-6 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(244,244,245,0.9))]">
  <div class="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
    <div class="flex min-h-[28dvh] items-center justify-center">
      <div class="w-full flex flex-col gap-5">
        <p class="font-[Goga] text-3xl tracking-tight text-foreground sm:text-[2.2rem]">Interrogate the noise.</p>
        <div class="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask about incidents, deploys, delivery drift, or team context..."
            bind:value={chatState.input}
            onkeydown={handleKeydown}
            disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
            class="h-[52px] flex-1 rounded-full border border-border bg-background/90 px-5 text-[15px] text-foreground placeholder:text-muted-foreground shadow-[0_18px_40px_-32px_rgba(24,24,27,0.25)] backdrop-blur focus:outline-none focus:ring-2 focus:ring-ring/10 disabled:opacity-50"
          />
          <Button
            onclick={handleSend}
            disabled={chatState.pending || chatState.streaming || chatState.loadingHistory || !chatState.input.trim()}
            class="h-[52px] shrink-0 rounded-full px-6"
          >
            <span class="inline-flex items-center gap-2">
              <Icon icon="solar:plain-2-linear" class="size-4" />
              Send
            </span>
          </Button>
        </div>
      </div>
    </div>
    <ConversationList />
  </div>
</ScrollArea>
