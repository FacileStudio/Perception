<script lang="ts">
  import { buildTitle } from '$lib/head';
  import ChatView from '$lib/components/chat/chat-view.svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();
</script>

<svelte:head>
  <title>{buildTitle('New conversation')}</title>
</svelte:head>

<ChatView autosend />
