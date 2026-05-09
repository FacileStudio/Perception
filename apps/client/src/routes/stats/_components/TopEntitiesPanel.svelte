<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import Icon from '@iconify/svelte';

  let { snap }: { snap: StatsSnapshot } = $props();

  type EntityEntry = { name: string; type: string; count: number };

  const ENTITY_TYPE_COLORS: Record<string, string> = {
    client: 'bg-emerald-50 text-emerald-700',
    organization: 'bg-emerald-50 text-emerald-700',
    company: 'bg-emerald-50 text-emerald-700',
    account: 'bg-emerald-50 text-emerald-700',
    person: 'bg-pink-50 text-pink-700',
    contact: 'bg-pink-50 text-pink-700',
    signer: 'bg-pink-50 text-pink-700',
    deployment: 'bg-indigo-50 text-indigo-700',
    service: 'bg-indigo-50 text-indigo-700',
    monitor: 'bg-indigo-50 text-indigo-700',
    task: 'bg-blue-50 text-blue-700',
    issue: 'bg-blue-50 text-blue-700',
    work_item: 'bg-blue-50 text-blue-700',
    contract: 'bg-violet-50 text-violet-700',
    document: 'bg-violet-50 text-violet-700',
    submission: 'bg-violet-50 text-violet-700',
    invoice: 'bg-amber-50 text-amber-700',
    payment: 'bg-amber-50 text-amber-700',
  };

  function entityTypeColor(type: string): string {
    const key = type.toLowerCase();
    for (const [k, v] of Object.entries(ENTITY_TYPE_COLORS)) {
      if (key.includes(k)) return v;
    }
    return 'bg-zinc-100 text-zinc-500';
  }

  const entities = $derived((snap.data.entities ?? []) as EntityEntry[]);
  const maxCount = $derived(entities.length > 0 ? Math.max(...entities.map((e) => e.count)) : 1);
  const isEmpty = $derived(entities.length === 0);
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-2">
    <Icon icon="solar:buildings-2-bold-duotone" class="size-4 text-zinc-500" />
    <span class="text-sm font-semibold text-zinc-900">Top Entities</span>
    <Badge variant="secondary" class="text-xs">{entities.length}</Badge>
    {#if !snap.min_sample_met}
      <Badge variant="outline" class="border-zinc-200 text-zinc-400 text-xs">limited sample</Badge>
    {/if}
  </div>

  {#if isEmpty}
    <p class="py-6 text-center text-sm text-zinc-400">No entity data in this window</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each entities as entity}
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2">
              <span class="truncate font-mono text-sm font-medium text-zinc-900">{entity.name}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium {entityTypeColor(entity.type)}">{entity.type}</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                class="h-full rounded-full bg-zinc-900 transition-all"
                style="width: {Math.round((entity.count / maxCount) * 100)}%"
              ></div>
            </div>
          </div>
          <span class="w-8 shrink-0 text-right font-mono text-sm text-zinc-500">{entity.count}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
