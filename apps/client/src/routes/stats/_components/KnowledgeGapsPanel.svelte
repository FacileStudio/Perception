<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const entities = $derived(data.isolated_entities);
</script>

<div class="flex items-center gap-2 mb-4">
  <Icon icon="solar:link-broken-linear" class="size-4 text-muted-foreground" />
  <span class="text-sm font-semibold text-foreground">Knowledge Gaps</span>
  <span class="text-xs text-muted-foreground ml-auto">{entities.length} isolated</span>
</div>

{#if entities.length === 0}
  <div class="flex flex-col items-center gap-2 py-6 text-center">
    <Icon icon="solar:check-circle-linear" class="size-6 text-emerald-300" />
    <span class="text-xs text-muted-foreground">All active entities have relationships. No gaps detected.</span>
  </div>
{:else}
  <div class="space-y-2 max-h-64 overflow-y-auto">
    {#each entities as entity}
      <div class="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-lg text-amber-600 bg-amber-50">
          <Icon icon="solar:danger-triangle-linear" class="size-3.5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-foreground truncate">{entity.name}</span>
            <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground bg-muted">{entity.type}</span>
          </div>
          <p class="text-[10px] text-muted-foreground mt-0.5">
            {entity.event_count} {entity.event_count === 1 ? 'event' : 'events'}, no relationships
          </p>
        </div>
      </div>
    {/each}
  </div>
{/if}
