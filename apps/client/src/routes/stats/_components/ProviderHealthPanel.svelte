<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const providers = $derived(data.providers);

  function formatCount(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }
</script>

<div class="flex items-center gap-2 mb-4">
  <Icon icon="solar:server-square-linear" class="size-4 text-muted-foreground" />
  <span class="text-sm font-semibold text-foreground">Provider Health</span>
  <span class="text-xs text-muted-foreground ml-auto">30-day window</span>
</div>

{#if providers.length === 0}
  <div class="flex flex-col items-center gap-2 py-6 text-center">
    <Icon icon="solar:server-square-linear" class="size-6 text-muted-foreground/50" />
    <span class="text-xs text-muted-foreground">No provider activity in the last 30 days.</span>
  </div>
{:else}
  <div class="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50">
    {#each providers as provider}
      <div class="flex items-center gap-3 px-3.5 py-3">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-xl {provider.drifted ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}">
          <Icon icon={provider.drifted ? 'solar:shield-warning-linear' : 'solar:shield-check-linear'} class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-foreground truncate">{provider.provider_name}</span>
            <span class="text-[10px] text-muted-foreground">{provider.provider_type}</span>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[10px] text-muted-foreground">{formatCount(provider.event_count)} events</span>
            {#if provider.drifted}
              <span class="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
                <span class="size-1 rounded-full bg-amber-400"></span>
                drifted
              </span>
            {/if}
            {#if !provider.schema_confirmed}
              <span class="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                schema unconfirmed
              </span>
            {/if}
          </div>
        </div>
        <div class="shrink-0">
          {#if provider.schema_confirmed && !provider.drifted}
            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              <Icon icon="solar:check-circle-linear" class="size-3" />
              healthy
            </span>
          {:else if provider.drifted}
            <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              <Icon icon="solar:danger-triangle-linear" class="size-3" />
              review
            </span>
          {:else}
            <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              pending
            </span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
