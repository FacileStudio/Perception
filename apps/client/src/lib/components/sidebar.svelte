<script lang="ts">
  import { page } from '$app/stores';
  import { Separator } from '$lib/components/ui/separator';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import { auth, notifications } from '$lib/stores';
  import { switchWorkspace } from '$lib/stores/auth.svelte';
  import CreateWorkspaceDrawer from '$lib/components/create-workspace-drawer.svelte';
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
  let menuContainer: HTMLDivElement | undefined;
  let wsContainer: HTMLDivElement | undefined;

  onMount(() => {
    notifications.refresh();
    const interval = setInterval(() => notifications.refresh(), 60_000);

    function handleClickOutside(e: MouseEvent) {
      if (menuContainer && !menuContainer.contains(e.target as Node)) {
        userMenuOpen = false;
      }
      if (wsContainer && !wsContainer.contains(e.target as Node)) {
        wsMenuOpen = false;
      }
    }
    document.addEventListener('click', handleClickOutside);

    return () => {
      clearInterval(interval);
      document.removeEventListener('click', handleClickOutside);
    };
  });

  async function handleSwitchWorkspace(id: string) {
    wsMenuOpen = false;
    await switchWorkspace(id);
    window.location.reload();
  }

  const navLinks = [
    { href: '/chat', label: 'Chat', icon: 'solar:chat-dots-linear', match: (p: string) => p.startsWith('/chat') },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-linear', match: (p: string) => p === '/context' },
    { href: '/entities', label: 'Entities', icon: 'solar:bill-list-linear', match: (p: string) => p === '/entities' },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-linear', match: (p: string) => p === '/stats' },
    { href: '/resources', label: 'Resources', icon: 'solar:documents-linear', match: (p: string) => p === '/resources' },
    { href: '/proposals', label: 'Proposals', icon: 'solar:hand-shake-linear', match: (p: string) => p === '/proposals' },
    { href: '/forecasts', label: 'Forecasts', icon: 'solar:telescope-linear', match: (p: string) => p.startsWith('/forecasts') },
  ];

  const menuItems = [
    { href: '/workspace', label: 'Workspace', icon: 'solar:buildings-linear' },
    { href: '/users', label: 'Users', icon: 'solar:users-group-rounded-linear' },
  ];
</script>

<aside class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 bg-white/95 backdrop-blur md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
  <div class="px-5 pb-4 pt-8">
    <PerceptionLogo
      class="gap-2"
      subtitle=""
      iconFrameClass="size-7"
      iconSizeClass="size-7"
      titleClass="text-2xl font-bold"
    />
  </div>

  {#if auth.workspaces.length > 0}
    <div class="relative px-3 pb-4" bind:this={wsContainer}>
      <button
        onclick={() => (wsMenuOpen = !wsMenuOpen)}
        class="flex w-full items-center gap-2 rounded-lg border border-zinc-200/70 bg-zinc-50/60 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-100"
      >
        <Icon icon="solar:buildings-linear" class="size-4 shrink-0 text-zinc-400" />
        <span class="min-w-0 flex-1 truncate font-medium text-zinc-700">
          {auth.workspace?.name ?? 'Select workspace'}
        </span>
        <Icon
          icon="solar:alt-arrow-down-linear"
          class="size-3 shrink-0 text-zinc-400 transition-transform {wsMenuOpen ? 'rotate-180' : ''}"
        />
      </button>

      {#if wsMenuOpen}
        <div class="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {#each auth.workspaces as ws}
            {@const active = ws.id === auth.workspace?.id}
            <button
              onclick={() => handleSwitchWorkspace(ws.id)}
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors {active ? 'bg-zinc-100 font-medium text-zinc-950' : 'text-zinc-600 hover:bg-zinc-50'}"
            >
              <Icon
                icon={active ? 'solar:check-circle-linear' : 'solar:buildings-linear'}
                class="size-4 shrink-0 {active ? 'text-emerald-500' : 'text-zinc-300'}"
              />
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
            <span>Create workspace</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <nav class="flex flex-1 flex-col gap-1 px-3">
    {#each navLinks as link}
      {@const active = link.match($page.url.pathname)}
      <a
        href={link.href}
        class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors {active ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
      >
        <Icon icon={link.icon} class="size-4 shrink-0 {active ? 'text-white' : ''}" />
        {link.label}
      </a>
    {/each}
  </nav>

  <Separator />

  <div class="p-4">
    {#if auth.user}
      <div class="relative" bind:this={menuContainer}>
        {#if userMenuOpen}
          <div class="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md">
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

        <div class="flex items-center gap-2">
          <button
            onclick={() => (userMenuOpen = !userMenuOpen)}
            class="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/60 px-3 text-left transition-colors hover:bg-zinc-100"
          >
            {#if auth.user.image}
              <img
                src={auth.user.image}
                alt={label}
                title={auth.user.source === 'oidc' ? 'Synced from SSO' : undefined}
                class="size-7 shrink-0 rounded-full object-cover"
              />
            {:else}
              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style="background-color: {auth.user.color}"
              >
                {initials(label)}
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-zinc-950">{auth.user.name || auth.user.email}</p>
            </div>
            <Icon
              icon="solar:alt-arrow-up-linear"
              class="size-3.5 shrink-0 text-zinc-400 transition-transform {userMenuOpen ? '' : 'rotate-180'}"
            />
          </button>

          <a
            href="/notifications"
            class="relative flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors {$page.url.pathname === '/notifications' ? 'border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800' : 'border-zinc-200/70 bg-zinc-50/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
          >
            <Icon icon="solar:bell-linear" class="size-4" />
            {#if notifications.unreadCount > 0}
              <span class="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {notifications.unreadCount > 99 ? '99+' : notifications.unreadCount}
              </span>
            {/if}
          </a>
        </div>
      </div>
    {/if}
  </div>
</aside>

<CreateWorkspaceDrawer bind:open={showCreateWs} />
