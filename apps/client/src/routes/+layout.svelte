<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth, checkAuth } from '$lib/stores.svelte';
  import { api } from '$lib/api';
  import Icon from '@iconify/svelte';
  import { Button } from '$lib/components/ui/button';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import { ensureSolar } from '$lib/solar';

  let { children }: { children?: any } = $props();

  ensureSolar();

  onMount(async () => {
    await checkAuth();
    if (!auth.authenticated && $page.url.pathname !== '/login') {
      goto('/login');
    }
  });

  $effect(() => {
    if (!auth.checking && !auth.authenticated && $page.url.pathname !== '/login') {
      goto('/login');
    }
  });

  async function handleLogout() {
    await api.auth.logout();
    auth.authenticated = false;
    goto('/login');
  }
</script>

{#if auth.checking}
  <div class="flex h-screen items-center justify-center">
    <span class="text-sm text-zinc-400">loading...</span>
  </div>
{:else if !auth.authenticated && $page.url.pathname !== '/login'}
  <div class="flex h-screen items-center justify-center">
    <span class="text-sm text-zinc-400">redirecting...</span>
  </div>
{:else if $page.url.pathname === '/login'}
  {@render children?.()}
{:else}
  <div class="flex h-screen flex-col bg-zinc-50/70">
    <nav class="border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-6">
          <PerceptionLogo subtitle="Operational context without archaeology" />
          <div class="flex items-center gap-1 rounded-2xl border border-zinc-200 bg-zinc-50 p-1">
          <a
            href="/"
            class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white {$page.url.pathname === '/' ? 'bg-white font-medium text-zinc-950 shadow-sm' : 'text-zinc-600'}"
          >
            <Icon icon="solar:chat-dots-bold-duotone" class="size-4" />
            Chat
          </a>
          <a
            href="/context"
            class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white {$page.url.pathname === '/context' ? 'bg-white font-medium text-zinc-950 shadow-sm' : 'text-zinc-600'}"
          >
            <Icon icon="solar:folder-with-files-bold-duotone" class="size-4" />
            Context
          </a>
          <a
            href="/stats"
            class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white {$page.url.pathname === '/stats' ? 'bg-white font-medium text-zinc-950 shadow-sm' : 'text-zinc-600'}"
          >
            <Icon icon="solar:chart-square-bold-duotone" class="size-4" />
            Stats
          </a>
        </div>
        </div>
        <Button variant="ghost" size="sm" onclick={handleLogout} class="self-start rounded-xl sm:self-auto">
          <span class="inline-flex items-center gap-2">
            <Icon icon="solar:logout-3-bold-duotone" class="size-4" />
            Logout
          </span>
        </Button>
      </div>
    </nav>
    <main class="flex-1 overflow-hidden">
      {@render children?.()}
    </main>
  </div>
{/if}
