<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api, type Forecast, type BeliefState, type ForecastInterval, type EnsembleResult } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let forecast = $state<Forecast | null>(null);
  let beliefs = $state<BeliefState[]>([]);
  let intervals = $state<ForecastInterval[]>([]);
  let ensemble = $state<EnsembleResult | null>(null);
  let loading = $state(true);
  let error = $state('');

  const STATUS_STYLE: Record<string, { icon: string; iconClass: string; label: string }> = {
    open: { icon: 'solar:clock-circle-linear', iconClass: 'text-amber-500 bg-amber-50', label: 'Open' },
    resolved: { icon: 'solar:check-circle-linear', iconClass: 'text-emerald-500 bg-emerald-50', label: 'Resolved' },
    expired: { icon: 'solar:alarm-linear', iconClass: 'text-muted-foreground bg-muted', label: 'Expired' },
    voided: { icon: 'solar:close-circle-linear', iconClass: 'text-red-400 bg-red-50', label: 'Voided' },
  };

  const TYPE_LABELS: Record<string, string> = { binary: 'Yes / No', numeric: 'Numeric', date: 'Date' };

  const CONFIDENCE_COLOR: Record<string, string> = {
    low: '#f59e0b',
    medium: '#3b82f6',
    high: '#10b981',
  };

  const STRATEGY_COLOR: Record<string, string> = {
    base_rate: '#71717a',
    causal: '#8b5cf6',
    pattern: '#10b981',
    llm_belief: '#3b82f6',
  };

  const SVG_W = 600;
  const SVG_H = 200;
  const PAD = { top: 20, right: 20, bottom: 32, left: 44 };
  const CW = SVG_W - PAD.left - PAD.right;
  const CH = SVG_H - PAD.top - PAD.bottom;

  let chartPoints = $derived.by(() => {
    if (beliefs.length === 0) return [];
    const sorted = [...beliefs].sort((a, b) => a.step - b.step);
    const maxStep = Math.max(sorted.length - 1, 1);
    return sorted.map((b, i) => ({
      x: PAD.left + (i / maxStep) * CW,
      y: PAD.top + CH - b.probability * CH,
      step: b.step,
      probability: b.probability,
      confidence: b.confidence,
    }));
  });

  let linePath = $derived(
    chartPoints.length > 0
      ? chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
      : ''
  );

  let intervalBands = $derived.by(() => {
    if (intervals.length === 0 || beliefs.length === 0) return [];
    const sorted = [...beliefs].sort((a, b) => a.step - b.step);
    const maxStep = Math.max(sorted.length - 1, 1);
    const stepMap = new Map(sorted.map((b, i) => [b.step, i]));
    return intervals
      .filter((iv) => stepMap.has(iv.belief_step))
      .map((iv) => {
        const idx = stepMap.get(iv.belief_step)!;
        const x = PAD.left + (idx / maxStep) * CW;
        return {
          x,
          yLower: PAD.top + CH - iv.lower_bound * CH,
          yUpper: PAD.top + CH - iv.upper_bound * CH,
        };
      })
      .sort((a, b) => a.x - b.x);
  });

  let bandPath = $derived.by(() => {
    if (intervalBands.length < 2) return '';
    const upper = intervalBands.map((b, i) => `${i === 0 ? 'M' : 'L'}${b.x},${b.yUpper}`).join(' ');
    const lower = [...intervalBands].reverse().map((b) => `L${b.x},${b.yLower}`).join(' ');
    return `${upper} ${lower} Z`;
  });

  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function pct(n: number): string {
    return `${Math.round(n * 100)}%`;
  }

  async function load(id: string) {
    loading = true;
    error = '';
    try {
      const [fRes, bRes, iRes, eRes] = await Promise.all([
        api.forecasts.get(id),
        api.forecasts.beliefs(id),
        api.forecasts.intervals(id),
        api.forecasts.ensemble(id),
      ]);
      forecast = fRes.forecast;
      beliefs = bRes.beliefs;
      intervals = iRes.intervals;
      ensemble = eRes.ensemble;
    } catch {
      error = 'Failed to load forecast details.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const id = $page.params.id;
    if (id) load(id);
  });
</script>

<svelte:head>
  <title>{buildTitle(forecast?.question ?? 'Forecast')}</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
    <a href="/forecasts" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <Icon icon="solar:arrow-left-linear" class="size-4" />
      Back
    </a>
    {#if forecast}
      {@const style = STATUS_STYLE[forecast.status] ?? STATUS_STYLE.open}
      <span class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Icon icon={style.icon} class="size-3.5 {style.iconClass.split(' ')[0]}" />
        {style.label}
      </span>
    {/if}
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-muted-foreground">Loading forecast...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-linear" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if forecast}
      <div class="mx-auto max-w-3xl space-y-5">
        <Card class="rounded-[20px] border border-border p-5">
          <h1 class="text-base font-semibold text-foreground">{forecast.question}</h1>
          <p class="mt-2 text-sm text-muted-foreground">{forecast.resolution_criteria}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {TYPE_LABELS[forecast.question_type] ?? forecast.question_type}
            </span>
            {#if forecast.entity_name}
              <span class="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {forecast.entity_name}
              </span>
            {/if}
            {#if forecast.base_rate !== null}
              <span class="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Base rate: {pct(forecast.base_rate)}
              </span>
            {/if}
            <span class="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Created {formatDate(forecast.created_at)}
            </span>
            <span class="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Resolves {formatDate(forecast.resolves_at)}
            </span>
            {#if forecast.status === 'resolved' && forecast.resolution_value !== null}
              <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                Resolved: {forecast.question_type === 'binary' ? (forecast.resolution_value >= 0.5 ? 'Yes' : 'No') : forecast.resolution_value}
              </span>
            {/if}
          </div>
        </Card>

        {#if beliefs.length > 0}
          <Card class="rounded-[20px] border border-border p-5">
            <h2 class="mb-3 text-sm font-semibold text-foreground">Belief Progression</h2>
            <svg viewBox="0 0 {SVG_W} {SVG_H}" class="w-full">
              {#each gridFracs as frac}
                {@const y = PAD.top + CH - frac * CH}
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={SVG_W - PAD.right}
                  y2={y}
                  stroke="#e4e4e7"
                  stroke-width="1"
                />
                <text
                  x={PAD.left - 6}
                  y={y}
                  text-anchor="end"
                  dominant-baseline="middle"
                  font-size="10"
                  fill="#a1a1aa"
                >{Math.round(frac * 100)}%</text>
              {/each}

              {#if bandPath}
                <path d={bandPath} fill="#3b82f6" fill-opacity="0.12" />
              {/if}

              {#if linePath}
                <path d={linePath} fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" />
              {/if}

              {#each chartPoints as pt}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  fill={CONFIDENCE_COLOR[pt.confidence] ?? '#3b82f6'}
                  stroke="white"
                  stroke-width="1.5"
                />
              {/each}

              {#each chartPoints as pt}
                <text
                  x={pt.x}
                  y={PAD.top + CH + 18}
                  text-anchor="middle"
                  font-size="10"
                  fill="#a1a1aa"
                >{pt.step}</text>
              {/each}
            </svg>
            <div class="mt-2 flex items-center justify-center gap-4">
              <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span class="inline-block size-2 rounded-full bg-amber-500"></span> Low
              </span>
              <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span class="inline-block size-2 rounded-full bg-blue-500"></span> Medium
              </span>
              <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span class="inline-block size-2 rounded-full bg-emerald-500"></span> High
              </span>
              {#if intervals.length > 0}
                <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span class="inline-block h-2 w-3 rounded-sm bg-blue-500/20"></span> Prediction interval
                </span>
              {/if}
            </div>
          </Card>
        {/if}

        {#if beliefs.length > 0}
          <Card class="rounded-[20px] border border-border p-5">
            <h2 class="mb-3 text-sm font-semibold text-foreground">Belief Timeline</h2>
            <div class="flex flex-col gap-3">
              {#each [...beliefs].sort((a, b) => b.step - a.step) as belief (belief.id)}
                {@const confColor = belief.confidence === 'low' ? 'amber' : belief.confidence === 'medium' ? 'blue' : 'emerald'}
                <div class="rounded-xl border border-border/60 bg-muted/40 p-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-semibold text-foreground">Step {belief.step}</span>
                      <span class="rounded-full border border-{confColor}-200/80 bg-{confColor}-50 px-2 py-0.5 text-[10px] font-medium text-{confColor}-600">
                        {pct(belief.probability)}
                      </span>
                      <span class="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {belief.confidence} confidence
                      </span>
                    </div>
                    <span class="text-[10px] text-muted-foreground">{formatTime(belief.created_at)}</span>
                  </div>
                  {#if belief.evidence_for}
                    <div class="mt-2.5">
                      <span class="text-[10px] font-medium text-emerald-600">Evidence for</span>
                      <p class="mt-0.5 text-xs text-muted-foreground">{belief.evidence_for}</p>
                    </div>
                  {/if}
                  {#if belief.evidence_against}
                    <div class="mt-2">
                      <span class="text-[10px] font-medium text-red-500">Evidence against</span>
                      <p class="mt-0.5 text-xs text-muted-foreground">{belief.evidence_against}</p>
                    </div>
                  {/if}
                  {#if belief.update_reasoning}
                    <div class="mt-2">
                      <span class="text-[10px] font-medium text-muted-foreground">Reasoning</span>
                      <p class="mt-0.5 text-xs text-muted-foreground">{belief.update_reasoning}</p>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </Card>
        {/if}

        {#if ensemble}
          <Card class="rounded-[20px] border border-border p-5">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-sm font-semibold text-foreground">Ensemble Breakdown</h2>
              <span class="rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
                {pct(ensemble.ensemble_probability)}
              </span>
            </div>
            <div class="flex flex-col gap-2.5">
              {#each ensemble.strategy_predictions as strat}
                {@const barColor = STRATEGY_COLOR[strat.strategy_type] ?? '#71717a'}
                <div>
                  <div class="mb-1 flex items-center justify-between">
                    <span class="text-xs font-medium text-foreground">{strat.strategy_name}</span>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] text-muted-foreground">weight {pct(strat.weight)}</span>
                      <span class="text-xs font-semibold text-foreground">{pct(strat.probability)}</span>
                    </div>
                  </div>
                  <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full transition-all"
                      style="width: {Math.round(strat.probability * 100)}%; background-color: {barColor}"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              {#each Object.entries(STRATEGY_COLOR) as [type, color]}
                <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span class="inline-block size-2 rounded-full" style="background-color: {color}"></span>
                  {type.replace('_', ' ')}
                </span>
              {/each}
            </div>
          </Card>
        {/if}
      </div>
    {/if}
  </div>
</div>
