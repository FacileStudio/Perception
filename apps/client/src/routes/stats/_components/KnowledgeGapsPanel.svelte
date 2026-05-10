<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const entities = $derived(data.isolated_entities);
</script>

<div class="flex items-center gap-2 mb-4">
  <Icon icon="solar:link-broken-bold-duotone" class="size-4 text-zinc-500" />
  <span class="text-sm font-semibold text-zinc-900">Knowledge Gaps</span>
  <span class="text-xs text-zinc-400 ml-auto">{entities.length} isolated</span>
</div>

{#if entities.length === 0}
  <div class="flex flex-col items-center gap-2 py-6 text-center">
    <Icon icon="solar:check-circle-bold-duotone" class="size-6 text-emerald-300" />
    <span class="text-xs text-zinc-400">All active entities have relationships. No gaps detected.</span>
  </div>
{:else}
  <div class="space-y-2 max-h-64 overflow-y-auto">
    {#each entities as entity}
      <div class="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-50">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-lg text-amber-600 bg-amber-50">
          <Icon icon="solar:danger-triangle-bold-duotone" class="size-3.5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-zinc-800 truncate">{entity.name}</span>
            <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 bg-zinc-100">{entity.type}</span>
          </div>
          <p class="text-[10px] text-zinc-400 mt-0.5">
            {entity.event_count} {entity.event_count === 1 ? 'event' : 'events'}, no relationships
          </p>
        </div>
      </div>
    {/each}
  </div>
{/if}
