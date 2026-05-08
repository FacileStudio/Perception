<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { chatState, deleteChatSession, loadChatSessions, openChatSession, startNewChat } from '$lib/stores.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  let { onLogout }: { onLogout: () => void | Promise<void> } = $props();

  ensureSolar();

  const navLinks = [
    { href: '/', label: 'Chat', icon: 'solar:chat-dots-bold-duotone' },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-bold-duotone' },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-bold-duotone' },
  ];

  function formatUpdatedAt(iso: string) {
    const date = new Date(iso);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async function handleNewChat() {
    startNewChat();
    await loadChatSessions();
    if ($page.url.pathname !== '/') {
      goto('/');
    }
  }

  async function handleOpenSession(sessionId: string) {
    if (chatState.pending || chatState.streaming || chatState.loadingHistory) return;
    await openChatSession(sessionId);
    if ($page.url.pathname !== '/') {
      goto('/');
    }
  }

  async function handleDeleteSession(event: MouseEvent, sessionId: string) {
    event.stopPropagation();
    if (chatState.pending || chatState.streaming || chatState.deletingSessionId) return;
    await deleteChatSession(sessionId);
    if ($page.url.pathname !== '/') {
      goto('/');
    }
  }
</script>

<aside class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 bg-white/95 backdrop-blur md:sticky md:top-0 md:h-screen md:w-72 md:border-b-0 md:border-r">
  <div class="px-5 pb-4 pt-8">
    <PerceptionLogo
      subtitle=""
      iconSizeClass="size-7"
      titleClass="text-2xl font-bold"
    />
    <Button
      class="mt-5 min-h-11 w-full justify-start gap-3 rounded-2xl"
      onclick={handleNewChat}
      disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
    >
      <Icon icon="solar:add-circle-bold-duotone" class="size-4" />
      New chat
    </Button>
  </div>

  <nav class="flex flex-col gap-1 px-3 pb-3">
    {#each navLinks as link}
      {@const active = $page.url.pathname === link.href}
      <a
        href={link.href}
        class="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors {active ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
      >
        <Icon icon={link.icon} class="size-4 shrink-0" />
        {link.label}
      </a>
    {/each}
  </nav>

  <div class="min-h-0 flex-1 px-3 pb-4">
    <div class="flex items-center justify-between px-2 pb-2">
      <span class="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-400">Conversations</span>
      {#if chatState.loadingSessions}
        <Icon icon="solar:refresh-bold-duotone" class="size-4 animate-spin text-zinc-300" />
      {/if}
    </div>

    <ScrollArea class="max-h-48 pr-1 md:h-full md:max-h-none">
      <div class="flex flex-col gap-2">
        {#if chatState.sessions.length === 0}
          <div class="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-xs leading-5 text-zinc-400">
            No saved conversations yet. Ask something interesting. Preferably less cursed than the average deploy incident.
          </div>
        {:else}
          {#each chatState.sessions as session}
            {@const activeSession = chatState.sessionId === session.id}
            <div class="flex items-start gap-1 rounded-[20px] border px-1.5 py-1.5 transition-colors {activeSession ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200/80 bg-white hover:border-zinc-300 hover:bg-zinc-50'}">
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col items-start rounded-2xl px-2.5 py-2 text-left"
                onclick={() => handleOpenSession(session.id)}
                disabled={chatState.pending || chatState.streaming || chatState.loadingHistory}
              >
                <div class="flex w-full items-center justify-between gap-2">
                  <span class="truncate text-sm font-medium">{session.title}</span>
                  <span class="shrink-0 text-[10px] uppercase tracking-[0.18em] {activeSession ? 'text-zinc-400' : 'text-zinc-300'}">
                    {formatUpdatedAt(session.updated_at)}
                  </span>
                </div>
                <span class="mt-1 truncate text-xs {activeSession ? 'text-zinc-400' : 'text-zinc-500'}">
                  {session.preview || 'No preview yet'}
                </span>
              </button>
              <button
                type="button"
                class="mt-1 inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-40 {activeSession ? 'hover:bg-zinc-800 hover:text-white' : ''}"
                onclick={(event) => handleDeleteSession(event, session.id)}
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
        {/if}
      </div>
    </ScrollArea>
  </div>

  <Separator />

  <div class="p-4">
    <Button
      variant="ghost"
      class="min-h-11 w-full justify-start gap-3 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      onclick={onLogout}
    >
      <Icon icon="solar:logout-3-bold-duotone" class="size-4" />
      Logout
    </Button>
  </div>
</aside>
