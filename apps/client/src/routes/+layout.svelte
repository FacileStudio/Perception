<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth, checkAuth } from '$lib/stores.svelte';
  import { api } from '$lib/api';
  import { Button } from '$lib/components/ui/button';

  let { children }: { children?: any } = $props();

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
  <div class="flex h-screen flex-col">
    <nav class="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <div class="flex items-center gap-6">
        <span class="font-mono text-sm font-semibold tracking-tight">perception</span>
        <div class="flex items-center gap-1">
          <a
            href="/"
            class="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 {$page.url.pathname === '/' ? 'bg-zinc-100 font-medium' : 'text-zinc-600'}"
          >
            Chat
          </a>
          <a
            href="/context"
            class="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 {$page.url.pathname === '/context' ? 'bg-zinc-100 font-medium' : 'text-zinc-600'}"
          >
            Context
          </a>
          <a
            href="/stats"
            class="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 {$page.url.pathname === '/stats' ? 'bg-zinc-100 font-medium' : 'text-zinc-600'}"
          >
            Stats
          </a>
        </div>
      </div>
      <Button variant="ghost" size="sm" onclick={handleLogout}>Logout</Button>
    </nav>
    <main class="flex-1 overflow-hidden">
      {@render children?.()}
    </main>
  </div>
{/if}
