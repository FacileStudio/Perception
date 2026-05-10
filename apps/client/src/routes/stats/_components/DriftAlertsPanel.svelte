<script lang="ts">
  import type { IntelligenceData } from '$lib/api';
  import Icon from '@iconify/svelte';

  let { data }: { data: IntelligenceData } = $props();

  const alerts = $derived(data.drift_alerts);

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  function severity(score: number): { cls: string; label: string } {
    if (score >= 0.5) return { cls: 'text-red-600 bg-red-50', label: 'high' };
    if (score >= 0.3) return { cls: 'text-amber-600 bg-amber-50', label: 'moderate' };
    return { cls: 'text-blue-600 bg-blue-50', label: 'low' };
  }
</script>

<div class="flex items-center gap-2 mb-4">
  <Icon icon="solar:shield-warning-bold-duotone" class="size-4 text-zinc-500" />
  <span class="text-sm font-semibold text-zinc-900">Schema Drift</span>
  <span class="text-xs text-zinc-400 ml-auto">{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
</div>

{#if alerts.length === 0}
  <div class="flex flex-col items-center gap-2 py-6 text-center">
    <Icon icon="solar:check-circle-bold-duotone" class="size-6 text-emerald-300" />
    <span class="text-xs text-zinc-400">All schemas stable. No drift detected.</span>
  </div>
{:else}
  <div class="space-y-2 max-h-64 overflow-y-auto">
    {#each alerts as alert}
      {@const sev = severity(alert.drift_score)}
      <div class="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-50">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-lg {sev.cls}">
          <Icon icon="solar:shield-warning-bold-duotone" class="size-3.5" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-zinc-800 truncate">{alert.provider_type}</span>
            <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium {sev.cls}">{sev.label}</span>
          </div>
          <p class="text-[10px] text-zinc-400 mt-0.5">
            {alert.field_name} — drift score {alert.drift_score.toFixed(2)}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="shrink-0 text-[10px] text-zinc-300">{timeAgo(alert.detected_at)}</span>
          <a href="/settings" class="shrink-0 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors">review</a>
        </div>
      </div>
    {/each}
  </div>
{/if}
