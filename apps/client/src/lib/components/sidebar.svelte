<script lang="ts">
  import { page } from '$app/stores';
  import { Separator } from '$lib/components/ui/separator';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as Tooltip from '$lib/components/ui/tooltip';
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

  let showCreateWs = $state(false);

  onMount(() => {
    notifications.refresh();
    const interval = setInterval(() => notifications.refresh(), 60_000);
    return () => clearInterval(interval);
  });

  async function handleSwitchWorkspace(id: string) {
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
    { href: '/workspace', label: 'Space', icon: 'solar:buildings-linear' },
    { href: '/users', label: 'Users', icon: 'solar:users-group-rounded-linear' },
  ];
</script>

<aside class="hidden w-60 shrink-0 flex-col border-r border-border bg-background/95 backdrop-blur md:sticky md:top-0 md:flex md:h-screen">
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
    <div class="px-3 pb-4">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
        >
          <Icon icon="solar:buildings-linear" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate font-medium">
            {auth.workspace?.name ?? 'Select space'}
          </span>
          <Icon icon="solar:alt-arrow-down-linear" class="size-3 shrink-0 text-muted-foreground" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-[var(--bits-dropdown-menu-anchor-width)]">
          {#each auth.workspaces as ws}
            {@const active = ws.id === auth.workspace?.id}
            <DropdownMenu.Item onclick={() => handleSwitchWorkspace(ws.id)} class={active ? 'font-medium' : ''}>
              <Icon
                icon={active ? 'solar:check-circle-linear' : 'solar:buildings-linear'}
                class="size-4 {active ? 'text-emerald-500' : 'text-muted-foreground/50'}"
              />
              <span class="min-w-0 flex-1 truncate">{ws.name}</span>
              <span class="text-xs text-muted-foreground">{ws.role}</span>
            </DropdownMenu.Item>
          {/each}
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={() => (showCreateWs = true)}>
            <Icon icon="mdi:plus" class="size-4 text-muted-foreground/50" />
            <span>Create space</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  {/if}

  <nav class="flex flex-1 flex-col gap-1 px-3">
    {#each navLinks as link}
      {@const active = link.match($page.url.pathname)}
      <a
        href={link.href}
        class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors {active ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
      >
        <Icon icon={link.icon} class="size-4 shrink-0" />
        {link.label}
      </a>
    {/each}
  </nav>

  <Separator />

  <div class="p-4">
    {#if auth.user}
      <div class="flex items-center gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-muted/60 px-3 text-left transition-colors hover:bg-accent"
          >
            <Avatar.Root size="sm">
              {#if auth.user.image}
                <Avatar.Image src={auth.user.image} alt={label} />
              {/if}
              <Avatar.Fallback style={auth.user.color ? `background-color: ${auth.user.color}; color: white;` : ''}>
                {initials(label)}
              </Avatar.Fallback>
            </Avatar.Root>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{auth.user.name || auth.user.email}</p>
            </div>
            <Icon icon="solar:alt-arrow-up-linear" class="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="top" align="start" class="w-[var(--bits-dropdown-menu-anchor-width)]">
            {#each menuItems as item}
              {@const active = $page.url.pathname === item.href}
              <a href={item.href}>
                <DropdownMenu.Item class={active ? 'font-medium' : ''}>
                  <Icon icon={item.icon} class="size-4" />
                  {item.label}
                </DropdownMenu.Item>
              </a>
            {/each}
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={onLogout} variant="destructive">
              <Icon icon="solar:logout-3-linear" class="size-4" />
              Logout
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <Tooltip.Root>
          <Tooltip.Trigger>
            <a
              href="/notifications"
              class="relative flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors {$page.url.pathname === '/notifications' ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border bg-muted/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
            >
              <Icon icon="solar:bell-linear" class="size-4" />
              {#if notifications.unreadCount > 0}
                <span class="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {notifications.unreadCount > 99 ? '99+' : notifications.unreadCount}
                </span>
              {/if}
            </a>
          </Tooltip.Trigger>
          <Tooltip.Content>Notifications</Tooltip.Content>
        </Tooltip.Root>
      </div>
    {/if}
  </div>
</aside>

<CreateSpaceDrawer bind:open={showCreateWs} />
