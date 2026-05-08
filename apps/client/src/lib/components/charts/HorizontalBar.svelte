<script lang="ts">
  type HBarData = { label: string; value: number }
  let { data, max }: { data: HBarData[]; max?: number } = $props()

  const effectiveMax = $derived(max ?? Math.max(...data.map(x => x.value), 1))
</script>

{#if data.length === 0}
  <p class="text-sm text-zinc-400 text-center py-4">No data</p>
{:else}
  <div class="flex flex-col gap-1.5 w-full">
    {#each data as d}
      {@const pct = ((d.value / effectiveMax) * 100).toFixed(1)}
      <div class="flex items-center gap-2">
        <span class="w-24 shrink-0 truncate text-xs text-zinc-500 text-right font-mono">{d.label}</span>
        <div class="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
          <div
            class="h-full bg-zinc-900 rounded-full transition-all duration-500"
            style="width: {pct}%"
          ></div>
        </div>
        <span class="w-8 shrink-0 text-xs text-zinc-400 tabular-nums text-right">{d.value}</span>
      </div>
    {/each}
  </div>
{/if}
