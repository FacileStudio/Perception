<script lang="ts">
  import { page } from '$app/stores';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';
  import PerceptionLogo from '$lib/components/perception-logo.svelte';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import { auth, notifications } from '$lib/stores';

  let { onLogout }: { onLogout: () => void | Promise<void> } = $props();

  ensureSolar();

  function initials(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  const label = $derived(auth.user?.name?.trim() || auth.user?.email || '');

  import { onMount } from 'svelte';

  onMount(() => {
    notifications.refresh();
    const interval = setInterval(() => notifications.refresh(), 60_000);
    return () => clearInterval(interval);
  });

  const navLinks = [
    { href: '/chat', label: 'Chat', icon: 'solar:chat-dots-bold-duotone', match: (p: string) => p.startsWith('/chat'), badge: 0 },
    { href: '/context', label: 'Context', icon: 'solar:folder-with-files-bold-duotone', match: (p: string) => p === '/context', badge: 0 },
    { href: '/graph', label: 'Graph', icon: 'solar:graph-bold-duotone', match: (p: string) => p === '/graph', badge: 0 },
    { href: '/notifications', label: 'Notifications', icon: 'solar:bell-bold-duotone', match: (p: string) => p === '/notifications', badge: 0 },
    { href: '/stats', label: 'Stats', icon: 'solar:chart-square-bold-duotone', match: (p: string) => p === '/stats', badge: 0 },
    { href: '/users', label: 'Users', icon: 'solar:users-group-rounded-bold-duotone', match: (p: string) => p === '/users', badge: 0 },
    { href: '/settings', label: 'Settings', icon: 'solar:settings-bold-duotone', match: (p: string) => p === '/settings', badge: 0 },
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
      {@const unread = link.href === '/notifications' ? notifications.unreadCount : 0}
      <a
        href={link.href}
        class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors {active ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950'}"
      >
        <Icon icon={link.icon} class="size-4 shrink-0 {active ? 'text-white' : ''}" />
        {link.label}
        {#if unread > 0}
          <span class="ml-auto inline-flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        {/if}
      </a>
    {/each}
  </nav>

  <Separator />

  <div class="flex flex-col gap-2 p-4">
    {#if auth.user}
      <div class="flex items-center gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/60 p-2.5">
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
      </div>
    {/if}
    <Button
      variant="ghost"
      size="sm"
      class="w-full justify-start gap-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
      onclick={onLogout}
    >
      <Icon icon="solar:logout-3-bold-duotone" class="size-4" />
      Logout
    </Button>
  </div>
</aside>
