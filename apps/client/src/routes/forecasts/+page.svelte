<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api, type Forecast } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  let items = $state<Forecast[]>([]);
  let loading = $state(false);
  let error = $state('');
  let filter = $state<'all' | 'open' | 'resolved' | 'expired'>('all');
  let showForm = $state(false);
  let submitting = $state(false);

  let formQuestion = $state('');
  let formType = $state<'binary' | 'numeric' | 'date'>('binary');
  let formCriteria = $state('');
  let formDeadline = $state('');

  const STATUS_STYLE: Record<string, { icon: string; iconClass: string; bgClass: string; borderClass: string }> = {
    open: {
      icon: 'solar:clock-circle-linear',
      iconClass: 'text-amber-500 bg-amber-50',
      bgClass: 'bg-amber-50/30',
      borderClass: 'border-amber-200/60',
    },
    resolved: {
      icon: 'solar:check-circle-linear',
      iconClass: 'text-emerald-500 bg-emerald-50',
      bgClass: 'bg-emerald-50/30',
      borderClass: 'border-emerald-200/60',
    },
    expired: {
      icon: 'solar:alarm-linear',
      iconClass: 'text-zinc-400 bg-zinc-100',
      bgClass: 'bg-zinc-50/30',
      borderClass: 'border-zinc-200/60',
    },
    voided: {
      icon: 'solar:close-circle-linear',
      iconClass: 'text-red-400 bg-red-50',
      bgClass: 'bg-red-50/30',
      borderClass: 'border-red-200/60',
    },
  };

  const TYPE_LABELS: Record<string, string> = {
    binary: 'Yes / No',
    numeric: 'Numeric',
    date: 'Date',
  };

  function timeRemaining(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 24) return `${hours}h remaining`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d remaining`;
    const months = Math.floor(days / 30);
    return `${months}mo remaining`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function load() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const status = filter === 'all' ? undefined : filter;
      const result = await api.forecasts.list(status);
      items = result.forecasts;
    } catch {
      error = 'Failed to load forecasts.';
    } finally {
      loading = false;
    }
  }

  async function createForecast() {
    if (!formQuestion.trim() || !formCriteria.trim() || !formDeadline) return;
    const deadline = new Date(formDeadline);
    if (isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
      error = 'Deadline must be a future date.';
      return;
    }
    submitting = true;
    error = '';
    try {
      const result = await api.forecasts.create({
        question: formQuestion.trim(),
        question_type: formType,
        resolution_criteria: formCriteria.trim(),
        resolves_at: deadline.toISOString(),
      });
      items = [result.forecast, ...items];
      showForm = false;
      formQuestion = '';
      formType = 'binary';
      formCriteria = '';
      formDeadline = '';
    } catch {
      error = 'Failed to create forecast.';
    } finally {
      submitting = false;
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
  <title>{buildTitle('Forecasts')}</title>
  <meta name="description" content="Predictive questions and resolution tracking" />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Icon icon="solar:telescope-linear" class="size-4" />
        Forecasts
      </span>
      {#if items.length > 0}
        <span class="text-xs text-zinc-400">{items.length} total</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <div class="flex rounded-full border border-zinc-200 p-0.5">
        {#each (['all', 'open', 'resolved', 'expired'] as const) as f}
          <button
            onclick={() => (filter = f)}
            class="rounded-full px-3 py-1 text-xs transition-colors {filter === f ? 'bg-zinc-950 font-medium text-white' : 'text-zinc-500 hover:text-zinc-700'}"
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        {/each}
      </div>
      <a
        href="/forecasts/calibration"
        class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <Icon icon="solar:tuning-2-linear" class="size-3.5" />
        Calibration
      </a>
      <Button
        variant="default"
        size="sm"
        class="rounded-full text-xs"
        onclick={() => (showForm = !showForm)}
      >
        <Icon icon="mdi:plus" class="mr-1.5 size-3.5" />
        New Forecast
      </Button>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if showForm}
      <Card class="mb-5 rounded-[20px] border border-zinc-200/80 p-5 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.15)]">
        <h3 class="mb-4 text-sm font-semibold text-zinc-900">New Forecast</h3>
        <div class="flex flex-col gap-3">
          <div>
            <label for="fc-question" class="mb-1 block text-xs font-medium text-zinc-600">Question</label>
            <input
              id="fc-question"
              type="text"
              bind:value={formQuestion}
              placeholder="Will X happen by Y?"
              class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="fc-type" class="mb-1 block text-xs font-medium text-zinc-600">Type</label>
              <select
                id="fc-type"
                bind:value={formType}
                class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400"
              >
                <option value="binary">Binary (Yes/No)</option>
                <option value="numeric">Numeric</option>
                <option value="date">Date</option>
              </select>
            </div>
            <div>
              <label for="fc-deadline" class="mb-1 block text-xs font-medium text-zinc-600">Resolves by</label>
              <input
                id="fc-deadline"
                type="date"
                bind:value={formDeadline}
                class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400"
              />
            </div>
          </div>
          <div>
            <label for="fc-criteria" class="mb-1 block text-xs font-medium text-zinc-600">Resolution criteria</label>
            <textarea
              id="fc-criteria"
              bind:value={formCriteria}
              placeholder="How will this be resolved?"
              rows="2"
              class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400"
            ></textarea>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              class="rounded-full text-xs"
              disabled={submitting || !formQuestion.trim() || !formCriteria.trim() || !formDeadline}
              onclick={createForecast}
            >
              {submitting ? 'Creating...' : 'Create Forecast'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="rounded-full text-xs"
              onclick={() => (showForm = false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">Loading forecasts...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-linear" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if items.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-20">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-zinc-100">
          <Icon icon="solar:telescope-linear" class="size-7 text-zinc-300" />
        </div>
        <span class="text-sm text-zinc-400">
          {filter === 'all' ? 'No forecasts yet' : `No ${filter} forecasts`}
        </span>
        {#if filter === 'all'}
          <span class="text-xs text-zinc-300">Create a forecast to start tracking predictions</span>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each items as forecast (forecast.id)}
          {@const style = STATUS_STYLE[forecast.status] ?? STATUS_STYLE.open}
          <a href="/forecasts/{forecast.id}" class="block">
            <Card
              class="group relative rounded-[20px] border {style.borderClass} {style.bgClass} p-4 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.15)] hover:shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)] transition-shadow"
            >
              <div class="flex items-start gap-3.5">
                <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl {style.iconClass}">
                  <Icon icon={style.icon} class="size-4.5" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h3 class="text-sm font-semibold text-zinc-900">{forecast.question}</h3>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      {#if forecast.status === 'open'}
                        <span class="text-xs font-medium text-amber-600">{timeRemaining(forecast.resolves_at)}</span>
                      {:else}
                        <span class="text-xs text-zinc-400">{formatDate(forecast.resolved_at ?? forecast.resolves_at)}</span>
                      {/if}
                    </div>
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {TYPE_LABELS[forecast.question_type] ?? forecast.question_type}
                    </span>
                    {#if forecast.entity_name}
                      <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        {forecast.entity_name}
                      </span>
                    {/if}
                    {#if forecast.base_rate !== null}
                      <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        Base rate: {Math.round(forecast.base_rate * 100)}%
                      </span>
                    {/if}
                    {#if forecast.status === 'resolved' && forecast.resolution_value !== null}
                      <span class="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                        Resolved: {forecast.question_type === 'binary' ? (forecast.resolution_value >= 0.5 ? 'Yes' : 'No') : forecast.resolution_value}
                      </span>
                    {/if}
                  </div>
                  {#if forecast.resolution_criteria}
                    <p class="mt-1.5 text-xs text-zinc-500">{forecast.resolution_criteria}</p>
                  {/if}
                </div>
              </div>
            </Card>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>
