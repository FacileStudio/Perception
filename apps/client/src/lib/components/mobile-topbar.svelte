<script lang="ts">
  import { page } from '$app/stores';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import { auth, notifications } from '$lib/stores';
  import { switchWorkspace } from '$lib/stores/auth.svelte';
  import CreateSpaceDrawer from '$lib/components/create-space-drawer.svelte';
  import { onMount } from 'svelte';

  let { onLogout }: { onLogout: () => void | Promise<void> } = $props();

  ensureSolar();

  function initials(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  const label = $derived(auth.user?.name?.trim() || auth.user?.email || '');

  let userMenuOpen = $state(false);
  let wsMenuOpen = $state(false);
  let showCreateWs = $state(false);
  let menuContainer = $state<HTMLDivElement>();
  let wsContainer = $state<HTMLDivElement>();

  onMount(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuContainer && !menuContainer.contains(e.target as Node)) userMenuOpen = false;
      if (wsContainer && !wsContainer.contains(e.target as Node)) wsMenuOpen = false;
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });

  async function handleSwitchWorkspace(id: string) {
    wsMenuOpen = false;
    await switchWorkspace(id);
    window.location.reload();
  }

  const menuItems = [
    { href: '/workspace', label: 'Space', icon: 'solar:share-circle-linear' },
    { href: '/users', label: 'Users', icon: 'solar:users-group-rounded-linear' },
  ];
</script>

<header
  class="sticky top-0 z-40 flex items-center gap-2 border-b border-zinc-200/80 bg-white/95 px-3 py-2.5 backdrop-blur md:hidden"
>
  <PerceptionLogo class="gap-2 shrink-0" subtitle="" iconFrameClass="size-7" iconSizeClass="size-7" titleClass="text-lg font-bold" />

  {#if auth.workspaces.length > 0}
    <div class="relative ml-auto min-w-0" bind:this={wsContainer}>
      <button
        onclick={() => (wsMenuOpen = !wsMenuOpen)}
        class="flex max-w-[40vw] items-center gap-1.5 rounded-lg border border-zinc-200/70 bg-zinc-50/60 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-zinc-100"
      >
        <Icon icon="solar:share-circle-linear" class="size-4 shrink-0 text-zinc-400" />
        <span class="min-w-0 flex-1 truncate font-medium text-zinc-700">{auth.workspace?.name ?? 'Space'}</span>
        <Icon icon="solar:alt-arrow-down-linear" class="size-3 shrink-0 text-zinc-400 transition-transform {wsMenuOpen ? 'rotate-180' : ''}" />
      </button>

      {#if wsMenuOpen}
        <div class="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {#each auth.workspaces as ws}
            {@const active = ws.id === auth.workspace?.id}
            <button
              onclick={() => handleSwitchWorkspace(ws.id)}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors {active ? 'bg-zinc-100 font-medium text-zinc-950' : 'text-zinc-600 hover:bg-zinc-50'}"
            >
              <Icon icon={active ? 'solar:check-circle-linear' : 'solar:share-circle-linear'} class="size-4 shrink-0 {active ? 'text-emerald-500' : 'text-zinc-300'}" />
              <span class="min-w-0 flex-1 truncate">{ws.name}</span>
              <span class="text-xs text-zinc-400">{ws.role}</span>
            </button>
          {/each}
          <div class="border-t border-zinc-100"></div>
          <button
            onclick={() => { wsMenuOpen = false; showCreateWs = true; }}
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
          >
            <Icon icon="mdi:plus" class="size-4 shrink-0 text-zinc-300" />
            <span>Create space</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <a
    href="/notifications"
    aria-label="Notifications"
    class="relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors {$page.url.pathname === '/notifications' ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200/70 bg-zinc-50/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'} {auth.workspaces.length > 0 ? '' : 'ml-auto'}"
  >
    <Icon icon="solar:bell-linear" class="size-4" />
    {#if notifications.unreadCount > 0}
      <span class="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
        {notifications.unreadCount > 99 ? '99+' : notifications.unreadCount}
      </span>
    {/if}
  </a>

  {#if auth.user}
    <div class="relative shrink-0" bind:this={menuContainer}>
      <button
        onclick={() => (userMenuOpen = !userMenuOpen)}
        aria-label="User menu"
        class="flex size-9 items-center justify-center rounded-full"
      >
        {#if auth.user.image}
          <img src={auth.user.image} alt={label} class="size-9 rounded-full object-cover" />
        {:else}
          <div class="flex size-9 items-center justify-center rounded-full text-xs font-semibold text-white" style="background-color: {auth.user.color}">
            {initials(label)}
          </div>
        {/if}
      </button>

      {#if userMenuOpen}
        <div class="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md">
          <div class="border-b border-zinc-100 px-3 py-2">
            <p class="truncate text-sm font-medium text-zinc-950">{auth.user.name || auth.user.email}</p>
            {#if auth.user.name}<p class="truncate text-xs text-zinc-400">{auth.user.email}</p>{/if}
          </div>
          {#each menuItems as item}
            {@const active = $page.url.pathname === item.href}
            <a
              href={item.href}
              onclick={() => (userMenuOpen = false)}
              class="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors {active ? 'bg-zinc-100 font-medium text-zinc-950' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950'}"
            >
              <Icon icon={item.icon} class="size-4 shrink-0" />
              {item.label}
            </a>
          {/each}
          <div class="border-t border-zinc-100"></div>
          <button
            onclick={() => { userMenuOpen = false; onLogout(); }}
            class="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
          >
            <Icon icon="solar:logout-3-linear" class="size-4 shrink-0" />
            Logout
          </button>
        </div>
      {/if}
    </div>
  {/if}
</header>

<CreateSpaceDrawer bind:open={showCreateWs} />
