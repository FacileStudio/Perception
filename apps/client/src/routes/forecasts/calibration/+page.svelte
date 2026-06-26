<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type CalibrationSnapshot, type StrategyScore, type ConformalState } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let snapshot = $state<CalibrationSnapshot | null>(null);
  let strategies = $state<StrategyScore[]>([]);
  let conformal = $state<ConformalState | null>(null);
  let loading = $state(true);
  let error = $state('');

  function brierColor(score: number): string {
    if (score < 0.2) return 'text-emerald-600';
    if (score < 0.3) return 'text-amber-600';
    return 'text-red-600';
  }

  function fmt(n: number, decimals = 3): string {
    return n.toFixed(decimals);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function binMidpoints(edges: number[]): number[] {
    const mids: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      mids.push((edges[i] + edges[i + 1]) / 2);
    }
    return mids;
  }

  function svgX(val: number): number {
    return 60 + val * 320;
  }

  function svgY(val: number): number {
    return 360 - val * 320;
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const [calRes, strRes, confRes] = await Promise.all([
        api.forecasts.calibration(),
        api.forecasts.strategies(),
        api.forecasts.conformalState(),
      ]);
      snapshot = calRes.snapshot;
      strategies = strRes.strategies.sort((a, b) => (a.brier_score ?? Infinity) - (b.brier_score ?? Infinity));
      conformal = confRes.state;
    } catch {
      error = 'Failed to load calibration data.';
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>{buildTitle('Calibration')}</title>
  <meta name="description" content="Forecast calibration metrics and reliability analysis" />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <a href="/forecasts" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <Icon icon="solar:arrow-left-linear" class="size-4" />
        Forecasts
      </a>
      <span class="text-muted-foreground/50">/</span>
      <span class="inline-flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon icon="solar:tuning-2-linear" class="size-4" />
        Calibration
      </span>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-muted-foreground">Loading calibration data...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-linear" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if !snapshot}
      <div class="flex flex-col items-center justify-center gap-3 py-20">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon icon="solar:tuning-2-linear" class="size-7 text-muted-foreground/50" />
        </div>
        <span class="text-sm text-muted-foreground">No calibration data yet</span>
        <span class="text-xs text-muted-foreground/50">Resolve some forecasts to generate calibration metrics</span>
      </div>
    {:else}
      <div class="flex flex-col gap-6">

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Brier Score</span>
            <span class="mt-1 block text-2xl font-semibold {brierColor(snapshot.brier_score)}">{fmt(snapshot.brier_score)}</span>
            <span class="mt-0.5 block text-[10px] text-muted-foreground">Lower is better</span>
          </Card>
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Log Score</span>
            <span class="mt-1 block text-2xl font-semibold text-foreground">{fmt(snapshot.log_score)}</span>
          </Card>
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Sharpness</span>
            <span class="mt-1 block text-2xl font-semibold text-foreground">{fmt(snapshot.sharpness_score)}</span>
          </Card>
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Forecast Count</span>
            <span class="mt-1 block text-2xl font-semibold text-foreground">{snapshot.forecast_count}</span>
            <span class="mt-0.5 block text-[10px] text-muted-foreground">{formatDate(snapshot.computed_at)}</span>
          </Card>
        </div>

        <Card class="rounded-[20px] border border-border p-5">
          <h3 class="mb-4 text-sm font-semibold text-foreground">Reliability Diagram</h3>
          {@const mids = binMidpoints(snapshot.bin_edges)}
          {@const activeBins = mids.map((m, i) => ({ mid: m, actual: snapshot!.bin_actuals[i], count: snapshot!.bin_counts[i] })).filter(b => b.count > 0)}
          <svg viewBox="0 0 420 400" class="w-full max-w-md" role="img" aria-label="Reliability diagram showing predicted vs observed frequencies">
            <rect x="60" y="40" width="320" height="320" fill="white" stroke="none" />

            {#each [0, 0.25, 0.5, 0.75, 1] as tick}
              <line x1={svgX(0)} y1={svgY(tick)} x2={svgX(1)} y2={svgY(tick)} stroke="#e4e4e7" stroke-width="1" />
              <line x1={svgX(tick)} y1={svgY(0)} x2={svgX(tick)} y2={svgY(1)} stroke="#e4e4e7" stroke-width="1" />
              <text x={svgX(tick)} y={svgY(0) + 16} text-anchor="middle" fill="#a1a1aa" font-size="10">{tick.toFixed(2)}</text>
              <text x={svgX(0) - 8} y={svgY(tick) + 3} text-anchor="end" fill="#a1a1aa" font-size="10">{tick.toFixed(2)}</text>
            {/each}

            <line
              x1={svgX(0)} y1={svgY(0)}
              x2={svgX(1)} y2={svgY(1)}
              stroke="#d4d4d8"
              stroke-width="1.5"
              stroke-dasharray="6 4"
            />

            {#if activeBins.length > 1}
              <polyline
                points={activeBins.map(b => `${svgX(b.mid)},${svgY(b.actual)}`).join(' ')}
                fill="none"
                stroke="#3b82f6"
                stroke-width="2"
                stroke-linejoin="round"
              />
            {/if}

            {#each activeBins as bin}
              {@const r = Math.max(4, Math.min(14, 3 + Math.log(bin.count + 1) * 2.5))}
              <circle
                cx={svgX(bin.mid)}
                cy={svgY(bin.actual)}
                {r}
                fill="#3b82f6"
                fill-opacity="0.8"
                stroke="white"
                stroke-width="1.5"
              />
              <title>{`Predicted: ${bin.mid.toFixed(2)}, Observed: ${bin.actual.toFixed(2)}, n=${bin.count}`}</title>
            {/each}

            <text x={svgX(0.5)} y={svgY(0) + 32} text-anchor="middle" fill="#71717a" font-size="11" font-weight="500">Mean Forecast Probability</text>
            <text
              x={svgX(0) - 40}
              y={svgY(0.5)}
              text-anchor="middle"
              fill="#71717a"
              font-size="11"
              font-weight="500"
              transform="rotate(-90, {svgX(0) - 40}, {svgY(0.5)})"
            >Observed Frequency</text>
          </svg>
        </Card>

        <div class="grid grid-cols-3 gap-3">
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Reliability</span>
            <span class="mt-1 block text-2xl font-semibold {snapshot.reliability_score < 0.05 ? 'text-emerald-600' : snapshot.reliability_score < 0.1 ? 'text-amber-600' : 'text-red-600'}">{fmt(snapshot.reliability_score)}</span>
            <span class="mt-0.5 block text-[10px] text-muted-foreground">Lower = better calibrated</span>
          </Card>
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Resolution</span>
            <span class="mt-1 block text-2xl font-semibold {snapshot.resolution_score > 0.1 ? 'text-emerald-600' : 'text-amber-600'}">{fmt(snapshot.resolution_score)}</span>
            <span class="mt-0.5 block text-[10px] text-muted-foreground">Higher = better discrimination</span>
          </Card>
          <Card class="rounded-[20px] border border-border p-4">
            <span class="text-xs font-medium text-muted-foreground">Uncertainty</span>
            <span class="mt-1 block text-2xl font-semibold text-foreground">{fmt(snapshot.uncertainty_score)}</span>
            <span class="mt-0.5 block text-[10px] text-muted-foreground">Inherent outcome entropy</span>
          </Card>
        </div>

        {#if strategies.length > 0}
          <Card class="rounded-[20px] border border-border p-5">
            <h3 class="mb-4 text-sm font-semibold text-foreground">Strategy Leaderboard</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-border text-xs text-muted-foreground">
                    <th class="pb-2 font-medium">Strategy</th>
                    <th class="pb-2 font-medium">Type</th>
                    <th class="pb-2 font-medium">Brier Score</th>
                    <th class="pb-2 font-medium">Forecasts</th>
                    <th class="pb-2 font-medium">Weight</th>
                    <th class="pb-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {#each strategies as s (s.strategy_id)}
                    <tr class="border-b border-border/50 {s.is_active ? '' : 'opacity-40'}">
                      <td class="py-2.5 font-medium text-foreground">{s.strategy_name}</td>
                      <td class="py-2.5 text-muted-foreground">
                        <span class="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium">{s.strategy_type}</span>
                      </td>
                      <td class="py-2.5">
                        {#if s.brier_score !== null}
                          <span class={brierColor(s.brier_score)}>{fmt(s.brier_score)}</span>
                        {:else}
                          <span class="text-muted-foreground/50">--</span>
                        {/if}
                      </td>
                      <td class="py-2.5 text-muted-foreground">{s.forecast_count}</td>
                      <td class="py-2.5">
                        <div class="flex items-center gap-2">
                          <div class="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div class="h-full rounded-full bg-blue-500" style="width: {Math.round(s.weight * 100)}%"></div>
                          </div>
                          <span class="text-xs text-muted-foreground">{fmt(s.weight, 2)}</span>
                        </div>
                      </td>
                      <td class="py-2.5">
                        {#if s.is_active}
                          <Icon icon="solar:check-circle-linear" class="size-4 text-emerald-500" />
                        {:else}
                          <Icon icon="solar:close-circle-linear" class="size-4 text-muted-foreground/50" />
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </Card>
        {/if}

        {#if conformal}
          <Card class="rounded-[20px] border border-border p-5">
            <h3 class="mb-4 text-sm font-semibold text-foreground">Conformal State</h3>
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-6">
                <div>
                  <span class="text-xs font-medium text-muted-foreground">Empirical Coverage</span>
                  <span class="mt-1 block text-xl font-semibold {Math.abs(conformal.empirical_coverage - conformal.coverage_target) < 0.05 ? 'text-emerald-600' : 'text-amber-600'}">
                    {(conformal.empirical_coverage * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span class="text-xs font-medium text-muted-foreground">Target Coverage</span>
                  <span class="mt-1 block text-xl font-semibold text-foreground">{(conformal.coverage_target * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <span class="text-xs font-medium text-muted-foreground">Alpha (t)</span>
                  <span class="mt-1 block text-xl font-semibold text-foreground">{fmt(conformal.alpha_t, 4)}</span>
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <span>Coverage</span>
                  <span>100%</span>
                </div>
                <div class="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    class="absolute inset-y-0 left-0 rounded-full {Math.abs(conformal.empirical_coverage - conformal.coverage_target) < 0.05 ? 'bg-emerald-500' : 'bg-amber-500'}"
                    style="width: {Math.round(conformal.empirical_coverage * 100)}%"
                  ></div>
                  <div
                    class="absolute inset-y-0 w-0.5 bg-zinc-900"
                    style="left: {Math.round(conformal.coverage_target * 100)}%"
                    title="Target: {(conformal.coverage_target * 100).toFixed(1)}%"
                  ></div>
                </div>
              </div>
            </div>
          </Card>
        {/if}

        {#if Object.keys(snapshot.domain_scores).length > 0}
          {@const domainEntries = Object.entries(snapshot.domain_scores)}
          {@const maxDomainBrier = Math.max(...domainEntries.map(([, d]) => d.brier))}
          <Card class="rounded-[20px] border border-border p-5">
            <h3 class="mb-4 text-sm font-semibold text-foreground">Per-Domain Scores</h3>
            <div class="flex flex-col gap-2.5">
              {#each domainEntries.sort((a, b) => a[1].brier - b[1].brier) as [domain, scores]}
                <div class="flex items-center gap-3">
                  <span class="w-28 shrink-0 truncate text-xs font-medium text-foreground" title={domain}>{domain}</span>
                  <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full {scores.brier < 0.2 ? 'bg-emerald-500' : scores.brier < 0.3 ? 'bg-amber-500' : 'bg-red-500'}"
                      style="width: {maxDomainBrier > 0 ? Math.round((scores.brier / maxDomainBrier) * 100) : 0}%"
                    ></div>
                  </div>
                  <span class="w-12 shrink-0 text-right text-xs {scores.brier < 0.2 ? 'text-emerald-600' : scores.brier < 0.3 ? 'text-amber-600' : 'text-red-600'}">{fmt(scores.brier)}</span>
                  <span class="w-10 shrink-0 text-right text-[10px] text-muted-foreground">n={scores.count}</span>
                </div>
              {/each}
            </div>
          </Card>
        {/if}

      </div>
    {/if}
  </div>
</div>
