<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
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
        edits[key] = settings[key] ?? '';
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

  onMount(() => load());

  const apiKeySection = ['anthropic_api_key', 'voyage_api_key'];
  const modelSection = ['llm_model', 'embedding_model', 'embedding_dimensions'];
  const systemSection = ['retention_days', 'store_raw_payloads', 'email_body_indexing'];
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
                    type="password"
                    bind:value={edits[key]}
                    placeholder="Enter new value…"
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

      </div>
    {/if}
  </div>
</div>
