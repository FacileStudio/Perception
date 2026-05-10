<script lang="ts">
  import { page } from '$app/stores';
  import { Separator } from '$lib/components/ui/separator';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import { auth, notifications } from '$lib/stores';
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
  let menuContainer: HTMLDivElement | undefined;

  onMount(() => {
    notifications.refresh();
    const interval = setInterval(() => notifications.refresh(), 60_000);

    function handleClickOutside(e: MouseEvent) {
      if (menuContainer && !menuContainer.contains(e.target as Node)) {
        userMenuOpen = false;
      }
    }
    document.addEventListener('click', handleClickOutside);

    return () => {
      clearInterval(interval);
      document.removeEventListener('click', handleClickOutside);
    };
  });

  const navLinks = [
    { href: '/chat', label: 'Chat', icon: 'solar:chat-dots-bold-duotone', match: (p: string) => p.startsWith('/chat') },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-bold-duotone', match: (p: string) => p === '/context' },
    { href: '/graph', label: 'Graph', icon: 'solar:graph-bold-duotone', match: (p: string) => p === '/graph' },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-bold-duotone', match: (p: string) => p === '/stats' },
  ];

  const menuItems = [
    { href: '/settings', label: 'Settings', icon: 'solar:settings-bold-duotone' },
    { href: '/users', label: 'Users', icon: 'solar:users-group-rounded-bold-duotone' },
  ];
</script>

<aside class="flex w-full shrink-0 flex-col border-b border-zinc-200/80 bg-white/95 backdrop-blur md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
  <div class="px-5 pb-6 pt-8">
    <PerceptionLogo
      class="gap-2"
      subtitle=""
      iconFrameClass="size-7"
      iconSizeClass="size-7"
      titleClass="text-2xl font-bold"
    />
  </div>

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
              <Icon icon="solar:logout-3-bold-duotone" class="size-4 shrink-0" />
              Logout
            </button>
          </div>
        {/if}

        <div class="flex items-center gap-2">
          <button
            onclick={() => (userMenuOpen = !userMenuOpen)}
            class="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/60 p-2.5 text-left transition-colors hover:bg-zinc-100"
          >
            <div
              class="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style="background-color: {auth.user.color}"
            >
              {initials(label)}
            </div>
            <div class="min-w-0 flex-1">
              {#if auth.user.name}
                <p class="truncate text-sm font-medium text-zinc-950">{auth.user.name}</p>
                <p class="truncate text-xs text-zinc-400">{auth.user.email}</p>
              {:else}
                <p class="truncate text-sm font-medium text-zinc-950">{auth.user.email}</p>
              {/if}
            </div>
            <Icon
              icon="solar:alt-arrow-up-bold-duotone"
              class="size-3.5 shrink-0 text-zinc-400 transition-transform {userMenuOpen ? '' : 'rotate-180'}"
            />
          </button>

          <a
            href="/notifications"
            class="relative flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors {$page.url.pathname === '/notifications' ? 'border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800' : 'border-zinc-200/70 bg-zinc-50/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
          >
            <Icon icon="solar:bell-bold-duotone" class="size-4" />
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
