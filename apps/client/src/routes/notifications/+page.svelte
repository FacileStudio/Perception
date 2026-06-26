<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api, type NotificationRow } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { buildTitle } from '$lib/head';
  import { notifications as notifStore } from '$lib/stores';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let items = $state<NotificationRow[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state('');
  let filter = $state<'all' | 'unread' | 'read'>('all');
  let markingAll = $state(false);

  const SEVERITY_STYLE: Record<string, { icon: string; iconClass: string; bgClass: string; borderClass: string }> = {
    critical: {
      icon: 'solar:danger-circle-linear',
      iconClass: 'text-red-500 bg-red-50',
      bgClass: 'bg-red-50/40',
      borderClass: 'border-red-200/60',
    },
    warning: {
      icon: 'solar:shield-warning-linear',
      iconClass: 'text-amber-500 bg-amber-50',
      bgClass: 'bg-amber-50/30',
      borderClass: 'border-amber-200/60',
    },
    info: {
      icon: 'solar:info-circle-linear',
      iconClass: 'text-blue-500 bg-blue-50',
      bgClass: 'bg-blue-50/30',
      borderClass: 'border-blue-200/60',
    },
  };

  const TYPE_LABELS: Record<string, string> = {
    entity_velocity_spike: 'Velocity Spike',
    service_health_degradation: 'Health Degradation',
    client_silence: 'Gone Quiet',
    actor_absence: 'Actor Absent',
  };

  function timeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const result = await api.notifications.list(filter);
      items = result.notifications;
      total = result.total;
    } catch {
      error = 'Failed to load notifications.';
    } finally {
      loading = false;
    }
  }

  async function markRead(id: string) {
    await api.notifications.markRead(id);
    const item = items.find(n => n.id === id);
    if (item) item.read_at = new Date().toISOString();
    notifStore.refresh();
  }

  async function markAllRead() {
    markingAll = true;
    await api.notifications.markAllRead();
    for (const n of items) {
      if (!n.read_at) n.read_at = new Date().toISOString();
    }
    markingAll = false;
    notifStore.refresh();
  }

  let mounted = false;

  $effect(() => {
    filter;
    if (mounted) untrack(() => load());
  });

  onMount(() => {
    mounted = true;
    load();
    notifStore.refresh();
  });
</script>

<svelte:head>
  <title>{buildTitle('Notifications')}</title>
  <meta name="description" content="Anomaly alerts and proactive digests" />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon icon="solar:bell-linear" class="size-4" />
        Notifications
      </span>
      {#if total > 0}
        <span class="text-xs text-muted-foreground">{total} total</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <div class="flex rounded-full border border-border p-0.5">
        {#each (['all', 'unread', 'read'] as const) as f}
          <button
            onclick={() => (filter = f)}
            class="rounded-full px-3 py-1 text-xs transition-colors {filter === f ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        {/each}
      </div>
      <Button
        variant="outline"
        size="sm"
        class="rounded-full text-xs"
        disabled={markingAll || items.every(n => n.read_at)}
        onclick={markAllRead}
      >
        <Icon icon="solar:check-read-linear" class="mr-1.5 size-3.5" />
        Mark all read
      </Button>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-muted-foreground">Loading notifications...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-linear" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if items.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-20">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon icon="solar:bell-linear" class="size-7 text-muted-foreground/50" />
        </div>
        <span class="text-sm text-muted-foreground">
          {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications yet'}
        </span>
        {#if filter === 'all'}
          <span class="text-xs text-muted-foreground/50">Anomaly alerts will appear here when the system detects unusual patterns</span>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each items as notif (notif.id)}
          {@const style = SEVERITY_STYLE[notif.severity] ?? SEVERITY_STYLE.info}
          <Card
            class="group relative rounded-[20px] border {style.borderClass} {notif.read_at ? 'opacity-60' : style.bgClass} p-4 transition-opacity hover:opacity-100"
          >
            <div class="flex items-start gap-3.5">
              <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl {style.iconClass}">
                <Icon icon={style.icon} class="size-4.5" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <h3 class="truncate text-sm font-semibold text-foreground">{notif.title}</h3>
                      {#if !notif.read_at}
                        <span class="size-2 shrink-0 rounded-full bg-blue-500"></span>
                      {/if}
                    </div>
                    <p class="mt-0.5 text-sm text-muted-foreground">{notif.message}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="text-xs text-muted-foreground">{timeAgo(notif.created_at)}</span>
                    {#if !notif.read_at}
                      <button
                        onclick={() => markRead(notif.id)}
                        class="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                        title="Mark as read"
                      >
                        <Icon icon="solar:check-circle-linear" class="size-4" />
                      </button>
                    {/if}
                  </div>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <span class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {TYPE_LABELS[notif.type] ?? notif.type}
                  </span>
                  {#if notif.entity_name}
                    <span class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {notif.entity_name}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
