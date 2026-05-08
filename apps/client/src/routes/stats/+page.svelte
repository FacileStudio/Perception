<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type StatsSnapshot } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';

  let snapshots = $state<StatsSnapshot[]>([]);
  let loading = $state(false);
  let error = $state('');

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  async function loadStats() {
    loading = true;
    error = '';
    try {
      const result = await api.stats.get();
      snapshots = result.snapshots;
    } catch {
      error = 'Failed to load stats.';
      snapshots = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => loadStats());
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
    <span class="text-sm font-medium">Stats Snapshots</span>
    <Button variant="outline" size="sm" onclick={loadStats} disabled={loading}>
      {loading ? 'Loading...' : 'Refresh'}
    </Button>
  </div>

  <div class="flex-1 overflow-y-auto px-6 py-4">
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">Loading...</span>
      </div>
    {:else if error}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if snapshots.length === 0}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">No stats snapshots yet.</span>
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each snapshots as snap}
          <Card class="p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm font-semibold">{snap.kind}</span>
                  {#if !snap.min_sample_met}
                    <Badge variant="outline" class="border-amber-300 text-amber-600">insufficient data</Badge>
                  {/if}
                </div>
                <span class="text-xs text-zinc-500">
                  {formatDate(snap.window_start)} → {formatDate(snap.window_end)}
                </span>
                <span class="text-xs text-zinc-400">
                  Generated {formatDate(snap.generated_at)} · {snap.source_count} source{snap.source_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {#if Object.keys(snap.data).length > 0}
              <Separator class="my-3" />
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <tbody>
                    {#each Object.entries(snap.data) as [key, val]}
                      <tr class="border-b border-zinc-100 last:border-0">
                        <td class="py-1.5 pr-4 font-mono text-zinc-500">{key}</td>
                        <td class="py-1.5 text-zinc-900">
                          {#if typeof val === 'object' && val !== null}
                            <pre class="font-mono text-xs text-zinc-700">{JSON.stringify(val, null, 2)}</pre>
                          {:else}
                            {String(val)}
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
