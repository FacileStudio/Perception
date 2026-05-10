<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type WorkerStatus } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';

  ensureSolar();

  type SourceMap = Record<string, string>;

  let settings = $state<Record<string, string>>({});
  let sources = $state<SourceMap>({});
  let loading = $state(true);
  let saving = $state(false);
  let saved = $state(false);
  let error = $state('');

  let edits = $state<Record<string, string>>({});
  let showSensitive = $state<Record<string, boolean>>({});

  const SENSITIVE_KEYS = new Set(['anthropic_api_key', 'voyage_api_key']);

  const KEY_LABELS: Record<string, string> = {
    anthropic_api_key: 'Anthropic API Key',
    voyage_api_key: 'Voyage AI API Key',
    llm_model: 'LLM Model',
    embedding_model: 'Embedding Model',
    embedding_dimensions: 'Embedding Dimensions',
    retention_days: 'Retention Days',
    store_raw_payloads: 'Store Raw Payloads',
    email_body_indexing: 'Email Body Indexing',
  };

  const KEY_DESCRIPTIONS: Record<string, string> = {
    anthropic_api_key: 'Used for chat completions',
    voyage_api_key: 'Used for semantic search embeddings',
    llm_model: 'Claude model for chat (e.g. claude-sonnet-4-6)',
    embedding_model: 'Voyage model for embeddings (e.g. voyage-4-lite)',
    embedding_dimensions: 'Vector dimensions (e.g. 1024)',
    retention_days: 'How many days to keep events',
    store_raw_payloads: 'Store full ingest payloads (true/false)',
    email_body_indexing: 'Index email bodies for search (true/false)',
  };

  async function load() {
    loading = true;
    error = '';
    try {
      const settingsRes = await api.settings.get();
      settings = settingsRes.settings;
      sources = settingsRes.sources;

      for (const key of Object.keys(KEY_LABELS)) {
        edits[key] = SENSITIVE_KEYS.has(key) ? '' : (settings[key] ?? '');
      }
    } catch {
      error = 'Failed to load settings.';
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    saved = false;
    error = '';
    try {
      const body: Record<string, string | null> = {};
      for (const [key, val] of Object.entries(edits)) {
        const trimmed = val.trim();
        if (SENSITIVE_KEYS.has(key) && trimmed.includes('•')) continue;
        if (trimmed !== (settings[key] ?? '')) {
          body[key] = trimmed === '' ? null : trimmed;
        }
      }
      await api.settings.update(body);
      saved = true;
      await load();
      setTimeout(() => (saved = false), 2500);
    } catch {
      error = 'Failed to save settings.';
    } finally {
      saving = false;
    }
  }

  async function clearSetting(key: string) {
    try {
      await api.settings.update({ [key]: null });
      await load();
    } catch {
      error = 'Failed to clear setting.';
    }
  }

  function sourceLabel(src: string) {
    if (src === 'db') return { label: 'dashboard', icon: 'solar:database-bold-duotone', cls: 'text-violet-600 bg-violet-50' };
    if (src === 'env') return { label: 'env var', icon: 'solar:server-bold-duotone', cls: 'text-blue-600 bg-blue-50' };
    return { label: 'default', icon: 'solar:info-circle-bold-duotone', cls: 'text-zinc-500 bg-zinc-100' };
  }

  onMount(() => { load(); loadEmbeddingStats(); loadWorkers(); });
  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (workerPollTimer) clearInterval(workerPollTimer);
  });

  let reembedding = $state(false);
  let reembedResult = $state<string | null>(null);
  let reprocessing = $state(false);
  let reprocessResult = $state<string | null>(null);
  let confirmAction = $state<'reembed' | 'reprocess' | null>(null);

  type EmbeddingStats = { total: number; pending: number; ready: number; error: number; locked: number };
  let embeddingStats = $state<EmbeddingStats | null>(null);
  let pollTimer = $state<ReturnType<typeof setInterval> | null>(null);

  let embeddingProgress = $derived(
    embeddingStats && embeddingStats.total > 0
      ? Math.round((embeddingStats.ready / embeddingStats.total) * 100)
      : null,
  );
  let embeddingBusy = $derived(
    embeddingStats ? (embeddingStats.pending + embeddingStats.locked) > 0 : false,
  );

  async function loadEmbeddingStats() {
    try {
      embeddingStats = await api.admin.embeddingStats();
      if (embeddingBusy && !pollTimer) {
        pollTimer = setInterval(loadEmbeddingStats, 3000);
      } else if (!embeddingBusy && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch {
      embeddingStats = null;
    }
  }

  async function reembedAll() {
    reembedding = true;
    reembedResult = null;
    try {
      const res = await api.admin.reembedAll();
      reembedResult = `${res.reset} embeddings queued for re-processing.`;
      await loadEmbeddingStats();
    } catch {
      reembedResult = 'Failed to trigger re-embed.';
    } finally {
      reembedding = false;
    }
  }

  async function reprocessEntities() {
    reprocessing = true;
    reprocessResult = null;
    try {
      const res = await api.admin.reprocessEntities();
      reprocessResult = `${res.actors_created} actors created, ${res.events_linked} events linked, ${res.relations_added} relations added.`;
    } catch {
      reprocessResult = 'Failed to reprocess entities.';
    } finally {
      reprocessing = false;
    }
  }

  const apiKeySection = ['anthropic_api_key', 'voyage_api_key'];
  const modelSection = ['llm_model', 'embedding_model', 'embedding_dimensions'];
  const systemSection = ['retention_days', 'store_raw_payloads', 'email_body_indexing'];

  let workersList = $state<WorkerStatus[]>([]);
  let workersLoading = $state(true);
  let triggeringWorker = $state<string | null>(null);
  let workerPollTimer = $state<ReturnType<typeof setInterval> | null>(null);

  const WORKER_ICONS: Record<string, string> = {
    'embedding': 'solar:magnet-bold-duotone',
    'schema-inference': 'solar:code-scan-bold-duotone',
    'uplift': 'solar:arrow-up-bold-duotone',
    'cross-link': 'solar:link-round-bold-duotone',
  };

  function formatInterval(ms: number): string {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${Math.round(ms / 3_600_000)}h`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  async function loadWorkers() {
    try {
      const res = await api.admin.workers();
      workersList = res.workers;
      const anyRunning = workersList.some((w) => w.status === 'running');
      if (anyRunning && !workerPollTimer) {
        workerPollTimer = setInterval(loadWorkers, 2000);
      } else if (!anyRunning && workerPollTimer) {
        clearInterval(workerPollTimer);
        workerPollTimer = null;
      }
    } catch {
      workersList = [];
    } finally {
      workersLoading = false;
    }
  }

  async function triggerWorker(name: string) {
    triggeringWorker = name;
    try {
      await api.admin.runWorker(name);
      await loadWorkers();
    } catch {
    } finally {
      triggeringWorker = null;
    }
  }
</script>

<svelte:head>
  <title>{buildTitle('Settings')}</title>
  <meta name="description" content="Configure API keys, models, and system settings." />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
      <Icon icon="solar:settings-bold-duotone" class="size-4" />
      Settings
    </span>
    <Button
      variant="default"
      size="sm"
      onclick={save}
      disabled={saving}
      class="rounded-xl gap-2"
    >
      <Icon icon={saved ? 'solar:check-circle-bold-duotone' : 'solar:diskette-bold-duotone'} class="size-4" />
      {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
    </Button>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">Loading settings…</span>
      </div>
    {:else}
      {#if error}
        <div class="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <Icon icon="solar:danger-triangle-bold-duotone" class="size-4 shrink-0" />
          {error}
        </div>
      {/if}

      <div class="flex flex-col gap-6 max-w-2xl">

        <section>
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">API Keys</h2>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
            {#each apiKeySection as key}
              {@const src = sourceLabel(sources[key] ?? 'default')}
              <div class="px-5 py-4">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span class="text-sm font-medium text-zinc-900">{KEY_LABELS[key]}</span>
                    <p class="text-xs text-zinc-400 mt-0.5">{KEY_DESCRIPTIONS[key]}</p>
                  </div>
                  <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium {src.cls}">
                    <Icon icon={src.icon} class="size-3" />
                    {src.label}
                  </span>
                </div>
                <div class="flex gap-2">
                  <Input
                    type={showSensitive[key] ? 'text' : 'password'}
                    bind:value={edits[key]}
                    placeholder="Enter new value…"
                    class="font-mono text-sm rounded-xl flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onclick={() => (showSensitive[key] = !showSensitive[key])}
                    class="shrink-0 rounded-xl"
                    title={showSensitive[key] ? 'Hide key' : 'Show key'}
                    aria-label={showSensitive[key] ? 'Hide key' : 'Show key'}
                  >
                    <Icon icon={showSensitive[key] ? 'solar:eye-closed-bold-duotone' : 'solar:eye-bold-duotone'} class="size-4" />
                  </Button>
                  {#if sources[key] === 'db'}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => clearSetting(key)}
                      class="shrink-0 rounded-xl text-zinc-400 hover:text-red-500"
                      title="Clear (revert to env/default)"
                    >
                      <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="size-4" />
                    </Button>
                  {/if}
                </div>
              </div>
            {/each}
          </Card>
        </section>

        <section>
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Models</h2>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
            {#each modelSection as key}
              {@const src = sourceLabel(sources[key] ?? 'default')}
              <div class="px-5 py-4">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span class="text-sm font-medium text-zinc-900">{KEY_LABELS[key]}</span>
                    <p class="text-xs text-zinc-400 mt-0.5">{KEY_DESCRIPTIONS[key]}</p>
                  </div>
                  <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium {src.cls}">
                    <Icon icon={src.icon} class="size-3" />
                    {src.label}
                  </span>
                </div>
                <div class="flex gap-2">
                  <Input
                    bind:value={edits[key]}
                    placeholder={settings[key] ?? 'Enter value…'}
                    class="font-mono text-sm rounded-xl flex-1"
                  />
                  {#if sources[key] === 'db'}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => clearSetting(key)}
                      class="shrink-0 rounded-xl text-zinc-400 hover:text-red-500"
                      title="Clear (revert to env/default)"
                    >
                      <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="size-4" />
                    </Button>
                  {/if}
                </div>
              </div>
            {/each}
          </Card>
        </section>

        <section>
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">System</h2>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
            {#each systemSection as key}
              {@const src = sourceLabel(sources[key] ?? 'default')}
              <div class="px-5 py-4">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span class="text-sm font-medium text-zinc-900">{KEY_LABELS[key]}</span>
                    <p class="text-xs text-zinc-400 mt-0.5">{KEY_DESCRIPTIONS[key]}</p>
                  </div>
                  <span class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium {src.cls}">
                    <Icon icon={src.icon} class="size-3" />
                    {src.label}
                  </span>
                </div>
                <div class="flex gap-2">
                  <Input
                    bind:value={edits[key]}
                    placeholder={settings[key] ?? 'Enter value…'}
                    class="font-mono text-sm rounded-xl flex-1"
                  />
                  {#if sources[key] === 'db'}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => clearSetting(key)}
                      class="shrink-0 rounded-xl text-zinc-400 hover:text-red-500"
                      title="Clear (revert to env/default)"
                    >
                      <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="size-4" />
                    </Button>
                  {/if}
                </div>
              </div>
            {/each}
          </Card>
        </section>

        <section>
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Maintenance</h2>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
            <div class="px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <span class="text-sm font-medium text-zinc-900">Re-embed all events</span>
                  <p class="text-xs text-zinc-400 mt-0.5">Reset all embeddings and re-generate with the latest input format. The embedding worker will process them in background.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => { confirmAction = 'reembed'; }}
                  disabled={reembedding}
                  class="shrink-0 rounded-xl gap-1.5"
                >
                  <Icon icon="solar:refresh-bold-duotone" class="size-3.5" />
                  {reembedding ? 'Processing…' : 'Re-embed'}
                </Button>
              </div>
              {#if reembedResult}
                <p class="mt-2 text-xs text-emerald-600">{reembedResult}</p>
              {/if}
              {#if embeddingStats}
                <div class="mt-3 space-y-1.5">
                  <div class="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>
                      {embeddingStats.ready}/{embeddingStats.total} ready
                      {#if embeddingStats.pending + embeddingStats.locked > 0}
                        <span class="text-amber-500">· {embeddingStats.pending + embeddingStats.locked} queued</span>
                      {/if}
                      {#if embeddingStats.error > 0}
                        <span class="text-red-400">· {embeddingStats.error} errors</span>
                      {/if}
                    </span>
                    {#if embeddingProgress !== null}
                      <span class="font-mono">{embeddingProgress}%</span>
                    {/if}
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      class="h-full rounded-full transition-all duration-500 {embeddingBusy ? 'bg-amber-400' : 'bg-emerald-400'}"
                      style="width: {embeddingProgress ?? 0}%"
                    ></div>
                  </div>
                </div>
              {/if}
            </div>
            <div class="px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <span class="text-sm font-medium text-zinc-900">Reprocess entities</span>
                  <p class="text-xs text-zinc-400 mt-0.5">Re-extract actor entities, re-run ontology labeling, and rebuild relations. May consume LLM tokens.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => { confirmAction = 'reprocess'; }}
                  disabled={reprocessing}
                  class="shrink-0 rounded-xl gap-1.5"
                >
                  <Icon icon="solar:graph-new-bold-duotone" class="size-3.5" />
                  {reprocessing ? 'Processing…' : 'Reprocess'}
                </Button>
              </div>
              {#if reprocessResult}
                <p class="mt-2 text-xs text-emerald-600">{reprocessResult}</p>
              {/if}
            </div>
          </Card>
        </section>

        <section>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Background Workers</h2>
            <button
              onclick={loadWorkers}
              class="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              title="Refresh worker status"
            >
              <Icon icon="solar:refresh-linear" class="size-3.5" />
            </button>
          </div>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
            {#if workersLoading}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">Loading workers…</div>
            {:else if workersList.length === 0}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">No workers registered.</div>
            {:else}
              {#each workersList as worker}
                <div class="px-5 py-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-start gap-3 min-w-0">
                      <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl {worker.status === 'running' ? 'bg-amber-50 text-amber-500' : worker.lastRun?.status === 'error' ? 'bg-red-50 text-red-400' : 'bg-emerald-50 text-emerald-500'}">
                        <Icon icon={WORKER_ICONS[worker.name] ?? 'solar:bolt-bold-duotone'} class="size-4" />
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-zinc-900">{worker.name}</span>
                          <span class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium {worker.status === 'running' ? 'bg-amber-50 text-amber-600' : worker.lastRun?.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}">
                            {#if worker.status === 'running'}
                              <span class="size-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                              running
                            {:else if worker.lastRun?.status === 'error'}
                              <span class="size-1.5 rounded-full bg-red-400"></span>
                              error
                            {:else}
                              <span class="size-1.5 rounded-full bg-emerald-400"></span>
                              idle
                            {/if}
                          </span>
                        </div>
                        <p class="text-xs text-zinc-400 mt-0.5">{worker.description}</p>
                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                          <span title="Run interval">
                            <Icon icon="solar:clock-circle-linear" class="inline size-3 -mt-px" />
                            every {formatInterval(worker.intervalMs)}
                          </span>
                          {#if worker.lastRun}
                            <span title="Last run">
                              <Icon icon="solar:history-linear" class="inline size-3 -mt-px" />
                              {timeAgo(worker.lastRun.started_at)}
                            </span>
                            <span title="Duration">
                              <Icon icon="solar:stopwatch-linear" class="inline size-3 -mt-px" />
                              {formatDuration(worker.lastRun.duration_ms)}
                            </span>
                          {:else}
                            <span class="italic">never run</span>
                          {/if}
                          {#if worker.totalRuns > 0}
                            <span title="Total runs / errors">
                              {worker.totalRuns} runs{#if worker.totalErrors > 0}<span class="text-red-400"> · {worker.totalErrors} errors</span>{/if}
                            </span>
                          {/if}
                        </div>
                        {#if worker.lastRun?.status === 'error' && worker.lastRun.error}
                          <p class="mt-1.5 text-[11px] text-red-400 truncate max-w-md" title={worker.lastRun.error}>
                            {worker.lastRun.error}
                          </p>
                        {/if}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => triggerWorker(worker.name)}
                      disabled={worker.status === 'running' || triggeringWorker === worker.name}
                      class="shrink-0 rounded-xl gap-1.5"
                    >
                      <Icon icon="solar:play-bold-duotone" class="size-3.5" />
                      {triggeringWorker === worker.name ? 'Running…' : 'Run now'}
                    </Button>
                  </div>
                </div>
              {/each}
            {/if}
          </Card>
        </section>

      </div>
    {/if}
  </div>

  {#if confirmAction}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div class="mx-4 w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
        <p class="text-sm font-semibold text-zinc-900">
          {confirmAction === 'reembed' ? 'Re-embed all events?' : 'Reprocess entities?'}
        </p>
        <p class="mt-2 text-xs leading-relaxed text-zinc-500">
          {confirmAction === 'reembed'
            ? 'This will reset all embeddings and re-generate them with the latest input format. The embedding worker will process them in the background.'
            : 'This re-processes all events — extracting actor entities, re-running ontology labeling, and rebuilding relations. It may take a while and will consume LLM tokens.'}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => { confirmAction = null; }}
            class="rounded-xl gap-1.5"
          >
            <Icon icon="solar:close-circle-linear" class="size-3.5" />
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onclick={() => {
              const action = confirmAction;
              confirmAction = null;
              if (action === 'reembed') reembedAll();
              else reprocessEntities();
            }}
            class="rounded-xl gap-1.5"
          >
            <Icon icon="solar:check-circle-linear" class="size-3.5" />
            Confirm
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
