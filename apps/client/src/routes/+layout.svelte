<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth, checkAuth, clearChatState, loadChatSessions } from '$lib/stores';
  import { authClient } from '$lib/auth-client';
  import { api } from '$lib/api';
  import Sidebar from '$lib/components/sidebar.svelte';
  import MobileNav from '$lib/components/mobile-nav.svelte';
  import MobileTopbar from '$lib/components/mobile-topbar.svelte';
  import { TooltipProvider } from '$lib/components/ui/tooltip';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  let { children }: { children?: any } = $props();

  ensureSolar();

  onMount(async () => {
    await checkAuth();
    if (auth.authenticated) {
      await loadChatSessions();
      api.auth.syncProfile().catch(() => {});
      return;
    }
    if ($page.url.pathname !== '/login' && !$page.url.pathname.startsWith('/docs')) {
      goto('/login');
    }
  });

  $effect(() => {
    if (!auth.checking && !auth.authenticated && $page.url.pathname !== '/login' && $page.url.pathname !== '/' && !$page.url.pathname.startsWith('/docs')) {
      goto('/login');
    }
  });

  async function handleLogout() {
    await authClient.signOut();
    clearChatState();
    auth.authenticated = false;
    auth.user = null;
    auth.workspace = null;
    auth.workspaces = [];
    goto('/login');
  }
</script>

{#if $page.url.pathname === '/login' || $page.url.pathname === '/' || $page.url.pathname.startsWith('/docs')}
  {@render children?.()}
{:else if auth.checking}
  <div class="flex h-screen items-center justify-center">
    <Icon icon="solar:spinner-line-duotone" class="size-6 text-muted-foreground animate-spin" />
  </div>
{:else if !auth.authenticated}
  <div class="flex h-screen items-center justify-center">
    <Icon icon="solar:spinner-line-duotone" class="size-6 text-muted-foreground animate-spin" />
  </div>
{:else}
  <TooltipProvider>
    <div class="flex min-h-screen w-full flex-col bg-muted/70 md:h-screen md:flex-row md:overflow-hidden">
      <Sidebar onLogout={handleLogout} />
      <MobileTopbar onLogout={handleLogout} />
      <main class="flex min-h-0 flex-1 flex-col pb-24 md:h-screen md:overflow-hidden md:pb-0">
        {@render children?.()}
      </main>
    </div>
    <MobileNav />
  </TooltipProvider>
{/if}
