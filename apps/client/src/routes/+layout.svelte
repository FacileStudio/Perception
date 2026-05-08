<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth, checkAuth } from '$lib/stores.svelte';
  import { api } from '$lib/api';
  import Sidebar from '$lib/components/sidebar.svelte';
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
  <div class="flex min-h-screen w-full flex-col bg-zinc-50/70 md:h-screen md:flex-row md:overflow-hidden">
    <Sidebar onLogout={handleLogout} />
    <main class="flex min-h-0 flex-1 flex-col md:h-screen md:overflow-hidden">
      {@render children?.()}
    </main>
  </div>
{/if}
