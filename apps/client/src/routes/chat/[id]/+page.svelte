<script lang="ts">
  import { chatState, loadChatSessions, openChatSession } from '$lib/stores';
  import { buildTitle } from '$lib/head';
  import ChatView from '$lib/components/chat/chat-view.svelte';
  import { ensureSolar } from '$lib/solar';

  let { data } = $props();

  ensureSolar();

  $effect(() => {
    const id = data.id;
    void (async () => {
      try {
        await openChatSession(id);
      } catch {
        try {
          await loadChatSessions();
        } catch {}
      }
    })();
  });

  function currentTitle() {
    const session = chatState.sessions.find((s) => s.id === data.id);
    return session?.title ?? 'Conversation';
  }
</script>

<svelte:head>
  <title>{buildTitle(currentTitle())}</title>
</svelte:head>

<ChatView />
