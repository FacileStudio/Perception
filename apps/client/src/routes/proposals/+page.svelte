<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api, type ActionProposal } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let items = $state<ActionProposal[]>([]);
  let loading = $state(false);
  let error = $state('');
  let filter = $state<'all' | 'proposed' | 'executed' | 'dismissed'>('all');

  const STATUS_STYLE: Record<string, { icon: string; iconClass: string; bgClass: string; borderClass: string }> = {
    proposed: {
      icon: 'solar:hand-shake-linear',
      iconClass: 'text-blue-500 bg-blue-50',
      bgClass: 'bg-blue-50/30',
      borderClass: 'border-blue-200/60',
    },
    approved: {
      icon: 'solar:clock-circle-linear',
      iconClass: 'text-amber-500 bg-amber-50',
      bgClass: 'bg-amber-50/30',
      borderClass: 'border-amber-200/60',
    },
    executed: {
      icon: 'solar:check-circle-linear',
      iconClass: 'text-emerald-500 bg-emerald-50',
      bgClass: 'bg-emerald-50/30',
      borderClass: 'border-emerald-200/60',
    },
    dismissed: {
      icon: 'solar:close-circle-linear',
      iconClass: 'text-zinc-400 bg-zinc-100',
      bgClass: 'bg-zinc-50/30',
      borderClass: 'border-zinc-200/60',
    },
    failed: {
      icon: 'solar:danger-triangle-linear',
      iconClass: 'text-red-500 bg-red-50',
      bgClass: 'bg-red-50/30',
      borderClass: 'border-red-200/60',
    },
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

  function confidenceLabel(c: number): string {
    if (c >= 0.8) return 'High';
    if (c >= 0.5) return 'Medium';
    return 'Low';
  }

  function confidenceColor(c: number): string {
    if (c >= 0.8) return 'text-emerald-600 bg-emerald-50 border-emerald-200/80';
    if (c >= 0.5) return 'text-amber-600 bg-amber-50 border-amber-200/80';
    return 'text-red-600 bg-red-50 border-red-200/80';
  }

  async function load() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const status = filter === 'all' ? undefined : filter;
      const result = await api.proposals.list(status);
      items = result.proposals;
    } catch {
      error = 'Failed to load proposals.';
    } finally {
      loading = false;
    }
  }

  async function approve(id: string) {
    try {
      await api.proposals.approve(id);
      const item = items.find(p => p.id === id);
      if (item) item.status = 'approved';
    } catch {
      error = 'Failed to approve proposal.';
    }
  }

  async function dismiss(id: string) {
    try {
      await api.proposals.dismiss(id);
      const item = items.find(p => p.id === id);
      if (item) item.status = 'dismissed';
    } catch {
      error = 'Failed to dismiss proposal.';
    }
  }

  let mounted = false;

  $effect(() => {
    filter;
    if (mounted) untrack(() => load());
  });

  onMount(() => {
    mounted = true;
    load();
  });
</script>

<svelte:head>
  <title>{buildTitle('Proposals')}</title>
  <meta name="description" content="Action proposals for write-back operations" />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Icon icon="solar:hand-shake-linear" class="size-4" />
        Proposals
      </span>
      {#if items.length > 0}
        <span class="text-xs text-zinc-400">{items.length} total</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <div class="flex rounded-full border border-zinc-200 p-0.5">
        {#each (['all', 'proposed', 'executed', 'dismissed'] as const) as f}
          <button
            onclick={() => (filter = f)}
            class="rounded-full px-3 py-1 text-xs transition-colors {filter === f ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:text-zinc-700'}"
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">Loading proposals...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-linear" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if items.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-20">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-zinc-100">
          <Icon icon="solar:hand-shake-linear" class="size-7 text-zinc-300" />
        </div>
        <span class="text-sm text-zinc-400">
          {filter === 'all' ? 'No proposals yet' : `No ${filter} proposals`}
        </span>
        {#if filter === 'all'}
          <span class="text-xs text-zinc-300">Action proposals will appear here when the system suggests write-back operations</span>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each items as proposal (proposal.id)}
          {@const style = STATUS_STYLE[proposal.status] ?? STATUS_STYLE.proposed}
          <Card
            class="group relative rounded-[20px] border {style.borderClass} {proposal.status === 'dismissed' ? 'opacity-60' : style.bgClass} p-4 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.15)] transition-opacity hover:opacity-100"
          >
            <div class="flex items-start gap-3.5">
              <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl {style.iconClass}">
                <Icon icon={style.icon} class="size-4.5" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold text-zinc-900">{proposal.title}</h3>
                    <p class="mt-0.5 text-sm text-zinc-600">{proposal.description}</p>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="text-xs text-zinc-400">{timeAgo(proposal.proposed_at)}</span>
                  </div>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {proposal.action_type}
                  </span>
                  {#if proposal.target_entity_name}
                    <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {proposal.target_entity_name}
                    </span>
                  {/if}
                  <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium {confidenceColor(proposal.confidence)}">
                    {confidenceLabel(proposal.confidence)} ({Math.round(proposal.confidence * 100)}%)
                  </span>
                </div>
                {#if proposal.status === 'proposed'}
                  <div class="mt-3 flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      class="rounded-full text-xs"
                      onclick={() => approve(proposal.id)}
                    >
                      <Icon icon="solar:check-circle-linear" class="mr-1.5 size-3.5" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      class="rounded-full text-xs"
                      onclick={() => dismiss(proposal.id)}
                    >
                      <Icon icon="solar:close-circle-linear" class="mr-1.5 size-3.5" />
                      Dismiss
                    </Button>
                  </div>
                {/if}
                {#if proposal.status === 'executed' && proposal.executed_result}
                  <div class="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                    <Icon icon="solar:check-circle-linear" class="size-3.5" />
                    {proposal.executed_result}
                  </div>
                {/if}
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
