<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type WorkerStatus, type GraphHealthSnapshot, type IsolatedEntity, type DriftAlert } from '$lib/api';
  import { auth, switchWorkspace, loadWorkspaces } from '$lib/stores/auth.svelte';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { buildTitle } from '$lib/head';
  import CreateWorkspaceDrawer from '$lib/components/create-workspace-drawer.svelte';
  import Icon from '@iconify/svelte';

  type Member = { id: string; user_id: string; name: string; email: string; role: string; joined_at: string };
  type WsStats = { event_count: number; entity_count: number; session_count: number; open_forecast_count: number };

  let members = $state<Member[]>([]);
  let wsStats = $state<WsStats | null>(null);
  let loading = $state(true);

  let editName = $state('');
  let editSlug = $state('');
  let saving = $state(false);
  let saveSuccess = $state('');
  let saveError = $state('');

  let showInvite = $state(false);
  let inviteEmail = $state('');
  let inviteRole = $state<'member' | 'admin'>('member');
  let inviting = $state(false);
  let inviteError = $state('');
  let inviteSuccess = $state('');

  let showCreate = $state(false);

  let settings = $state<Record<string, string>>({});
  let sources = $state<Record<string, string>>({});
  let settingsLoading = $state(true);
  let settingsSaving = $state(false);
  let settingsSaved = $state(false);
  let settingsError = $state('');
  let edits = $state<Record<string, string>>({});
  let showSensitive = $state<Record<string, boolean>>({});

  const SENSITIVE_KEYS = new Set(['ingest_secret', 'anthropic_api_key', 'voyage_api_key']);

  const KEY_LABELS: Record<string, string> = {
    ingest_secret: 'Ingest Signing Secret',
    anthropic_api_key: 'Anthropic API Key',
    voyage_api_key: 'Voyage AI API Key',
    llm_model: 'LLM Model',
    embedding_model: 'Embedding Model',
    embedding_dimensions: 'Embedding Dimensions',
    retention_days: 'Retention Days',
    store_raw_payloads: 'Store Raw Payloads',
    email_body_indexing: 'Email Body Indexing',
    notification_webhook_url: 'Notification Webhook URL',
  };

  const KEY_DESCRIPTIONS: Record<string, string> = {
    ingest_secret: 'HMAC-SHA256 secret used to verify ingest requests targeting this workspace',
    anthropic_api_key: 'Used for chat completions',
    voyage_api_key: 'Used for semantic search embeddings',
    llm_model: 'Claude model for chat (e.g. claude-sonnet-4-6)',
    embedding_model: 'Voyage model for embeddings (e.g. voyage-4-lite)',
    embedding_dimensions: 'Vector dimensions (e.g. 1024)',
    retention_days: 'How many days to keep events',
    store_raw_payloads: 'Store full ingest payloads (true/false)',
    email_body_indexing: 'Index email bodies for search (true/false)',
    notification_webhook_url: 'POST alerts to this URL',
  };

  const ingestSection = ['ingest_secret'];
  const apiKeySection = ['anthropic_api_key', 'voyage_api_key'];
  const modelSection = ['llm_model', 'embedding_model', 'embedding_dimensions'];
  const systemSection = ['retention_days', 'store_raw_payloads', 'email_body_indexing'];
  const notificationsSection = ['notification_webhook_url'];

  let tab = $state<'general' | 'settings' | 'workers' | 'health'>('general');

  let workersList = $state<WorkerStatus[]>([]);
  let workersLoading = $state(true);
  let workersPaused = $state(false);
  let togglingPause = $state(false);
  let triggeringWorker = $state<string | null>(null);
  let workerPollTimer = $state<ReturnType<typeof setInterval> | null>(null);

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

  let graphHealth = $state<GraphHealthSnapshot | null>(null);
  let isolatedEntities = $state<IsolatedEntity[]>([]);
  let driftAlerts = $state<DriftAlert[]>([]);
  let healthLoading = $state(true);
  let driftLoading = $state(true);

  onMount(async () => {
    await Promise.all([loadData(), loadSettings()]);
    loadEmbeddingStats();
    loadWorkers();
    loadGraphHealth();
    loadDriftAlerts();
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (workerPollTimer) clearInterval(workerPollTimer);
  });

  async function loadData() {
    loading = true;
    try {
      if (auth.workspace) {
        editName = auth.workspace.name;
        editSlug = auth.workspace.slug;
        const [m, s] = await Promise.all([
          api.workspaces.members(auth.workspace.id),
          api.workspaces.stats(auth.workspace.id),
        ]);
        members = m.members;
        wsStats = s;
      }
    } catch {
    } finally {
      loading = false;
    }
  }

  async function loadSettings() {
    if (!auth.workspace) return;
    settingsLoading = true;
    try {
      const res = await api.workspaces.settings(auth.workspace.id);
      settings = res.settings;
      sources = res.sources;
      for (const key of Object.keys(KEY_LABELS)) {
        edits[key] = SENSITIVE_KEYS.has(key) ? '' : (settings[key] ?? '');
      }
    } catch {
      settingsError = 'Failed to load settings.';
    } finally {
      settingsLoading = false;
    }
  }

  async function saveSettings() {
    if (!auth.workspace) return;
    settingsSaving = true;
    settingsSaved = false;
    settingsError = '';
    try {
      const body: Record<string, string | null> = {};
      for (const [key, val] of Object.entries(edits)) {
        const trimmed = val.trim();
        if (SENSITIVE_KEYS.has(key) && trimmed.includes('••')) continue;
        if (trimmed !== (settings[key] ?? '')) {
          body[key] = trimmed === '' ? null : trimmed;
        }
      }
      await api.workspaces.updateSettings(auth.workspace.id, body);
      settingsSaved = true;
      await loadSettings();
      setTimeout(() => (settingsSaved = false), 2500);
    } catch {
      settingsError = 'Failed to save settings.';
    } finally {
      settingsSaving = false;
    }
  }

  async function clearSetting(key: string) {
    if (!auth.workspace) return;
    try {
      await api.workspaces.updateSettings(auth.workspace.id, { [key]: null });
      await loadSettings();
    } catch {
      settingsError = 'Failed to clear setting.';
    }
  }

  function sourceLabel(src: string) {
    if (src === 'workspace') return { label: 'workspace', icon: 'solar:buildings-bold-duotone', cls: 'text-violet-600 bg-violet-50' };
    if (src === 'db') return { label: 'system', icon: 'solar:database-bold-duotone', cls: 'text-blue-600 bg-blue-50' };
    if (src === 'env') return { label: 'env var', icon: 'solar:server-bold-duotone', cls: 'text-emerald-600 bg-emerald-50' };
    return { label: 'default', icon: 'solar:info-circle-bold-duotone', cls: 'text-zinc-500 bg-zinc-100' };
  }

  async function handleSaveGeneral(e: Event) {
    e.preventDefault();
    if (!auth.workspace || saving) return;
    saving = true;
    saveError = '';
    saveSuccess = '';
    try {
      const body: { name?: string; slug?: string } = {};
      if (editName.trim() && editName.trim() !== auth.workspace.name) body.name = editName.trim();
      if (editSlug.trim() && editSlug.trim() !== auth.workspace.slug) body.slug = editSlug.trim();
      if (!body.name && !body.slug) { saving = false; return; }
      await api.workspaces.update(auth.workspace.id, body);
      saveSuccess = 'Workspace updated.';
      await loadWorkspaces();
    } catch (err: any) {
      saveError = err?.message ?? 'Failed to update workspace.';
    } finally {
      saving = false;
    }
  }

  async function handleInvite(e: Event) {
    e.preventDefault();
    if (!inviteEmail.trim() || !auth.workspace) return;
    inviting = true;
    inviteError = '';
    inviteSuccess = '';
    try {
      await api.workspaces.invite(auth.workspace.id, inviteEmail.trim(), inviteRole);
      inviteSuccess = `Invitation sent to ${inviteEmail}`;
      inviteEmail = '';
      await loadData();
    } catch (err: any) {
      inviteError = err?.message ?? 'Failed to send invitation.';
    } finally {
      inviting = false;
    }
  }

  async function handleRemoveMember(memberId: string, email: string) {
    if (!auth.workspace || !confirm(`Remove ${email} from this workspace?`)) return;
    try {
      await api.workspaces.removeMember(auth.workspace.id, memberId);
      await loadData();
    } catch {}
  }

  async function handleChangeRole(memberId: string, currentRole: string) {
    if (!auth.workspace) return;
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await api.workspaces.updateMemberRole(auth.workspace.id, memberId, newRole);
      await loadData();
    } catch {}
  }

  async function handleSwitchWorkspace(id: string) {
    await switchWorkspace(id);
    window.location.reload();
  }

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

  async function loadEmbeddingStats() {
    try {
      embeddingStats = await api.admin.embeddingStats();
      if (embeddingBusy && !pollTimer) {
        pollTimer = setInterval(loadEmbeddingStats, 3000);
      } else if (!embeddingBusy && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch { embeddingStats = null; }
  }

  async function loadWorkers() {
    try {
      const res = await api.admin.workers();
      workersList = res.workers;
      workersPaused = res.paused;
      const anyRunning = workersList.some((w) => w.status === 'running');
      if (anyRunning && !workerPollTimer) workerPollTimer = setInterval(loadWorkers, 2000);
      else if (!anyRunning && workerPollTimer) { clearInterval(workerPollTimer); workerPollTimer = null; }
    } catch { workersList = []; } finally { workersLoading = false; }
  }

  async function toggleWorkersPaused() {
    togglingPause = true;
    try { const res = await api.admin.setWorkersPaused(!workersPaused); workersPaused = res.paused; }
    catch {} finally { togglingPause = false; }
  }

  async function triggerWorker(name: string) {
    triggeringWorker = name;
    try { await api.admin.runWorker(name); await loadWorkers(); } catch {} finally { triggeringWorker = null; }
  }

  async function loadGraphHealth() {
    try {
      const res = await api.admin.graphHealth();
      graphHealth = res.snapshot;
      isolatedEntities = res.isolated;
    } catch { graphHealth = null; isolatedEntities = []; } finally { healthLoading = false; }
  }

  async function loadDriftAlerts() {
    try { const res = await api.admin.driftAlerts(); driftAlerts = res.alerts; }
    catch { driftAlerts = []; } finally { driftLoading = false; }
  }

  async function reembedAll() {
    reembedding = true; reembedResult = null;
    try { const res = await api.admin.reembedAll(); reembedResult = `${res.reset} embeddings queued.`; await loadEmbeddingStats(); }
    catch { reembedResult = 'Failed.'; } finally { reembedding = false; }
  }

  async function reprocessEntities() {
    reprocessing = true; reprocessResult = null;
    try { const res = await api.admin.reprocessEntities(); reprocessResult = `${res.actors_created} actors, ${res.events_linked} events linked, ${res.relations_added} relations.`; }
    catch { reprocessResult = 'Failed.'; } finally { reprocessing = false; }
  }

  $effect(() => {
    if (auth.workspace) {
      editName = auth.workspace.name;
      editSlug = auth.workspace.slug;
    }
  });
</script>

<svelte:head>
  <title>{buildTitle('Workspace')}</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
    <div class="flex items-center gap-4">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Icon icon="solar:buildings-bold-duotone" class="size-4" />
        {auth.workspace?.name ?? 'Workspace'}
      </span>
      <div class="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
        {#each [
          { key: 'general', label: 'General', icon: 'solar:settings-bold-duotone' },
          { key: 'settings', label: 'Config', icon: 'solar:tuning-2-bold-duotone' },
          { key: 'workers', label: 'Workers', icon: 'solar:bolt-bold-duotone' },
          { key: 'health', label: 'Health', icon: 'solar:heart-pulse-bold-duotone' },
        ] as item}
          <button
            onclick={() => tab = item.key as typeof tab}
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors {tab === item.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}"
          >
            <Icon icon={item.icon} class="size-3.5" />
            {item.label}
          </button>
        {/each}
      </div>
    </div>
    <Button onclick={() => (showCreate = !showCreate)} variant="outline" size="sm">
      <Icon icon="solar:add-circle-bold-duotone" class="mr-1.5 size-4" />
      New workspace
    </Button>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    <div class="mx-auto max-w-2xl space-y-6">

      <CreateWorkspaceDrawer bind:open={showCreate} />

      {#if tab === 'general'}
        <div class="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 class="text-lg font-semibold text-zinc-950 mb-4">Workspace details</h2>
          {#if saveError}<p class="mb-3 text-sm text-destructive">{saveError}</p>{/if}
          {#if saveSuccess}<p class="mb-3 text-sm text-emerald-600">{saveSuccess}</p>{/if}
          <form onsubmit={handleSaveGeneral} class="space-y-4">
            <div class="space-y-1.5">
              <Label for="edit-name">Workspace name</Label>
              <Input id="edit-name" bind:value={editName} placeholder="My Team" disabled={saving} />
              <p class="text-xs text-zinc-400">The display name shown in the sidebar and across the app.</p>
            </div>
            <div class="space-y-1.5">
              <Label for="edit-slug">Workspace slug</Label>
              <Input id="edit-slug" bind:value={editSlug} placeholder="my-team" disabled={saving} />
              <p class="text-xs text-zinc-400">URL-safe identifier used in API references and ingest targeting.</p>
            </div>
            <div class="space-y-1.5">
              <Label for="ws-id">Workspace ID</Label>
              <Input id="ws-id" value={auth.workspace?.id ?? ''} disabled class="font-mono text-xs opacity-70" />
              <p class="text-xs text-zinc-400">Use this value for the <code class="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">x-perception-workspace</code> ingest header.</p>
            </div>
            <Button type="submit" disabled={saving} size="sm">{saving ? 'Saving...' : 'Save'}</Button>
          </form>
        </div>

        {#if wsStats}
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {#each [
              { label: 'Events', value: wsStats.event_count },
              { label: 'Entities', value: wsStats.entity_count },
              { label: 'Chat sessions', value: wsStats.session_count },
              { label: 'Open forecasts', value: wsStats.open_forecast_count },
            ] as stat}
              <div class="rounded-lg border border-zinc-200 bg-white p-4">
                <p class="text-2xl font-bold text-zinc-950">{stat.value.toLocaleString()}</p>
                <p class="text-xs text-zinc-500">{stat.label}</p>
              </div>
            {/each}
          </div>
        {/if}

        <div class="rounded-lg border border-zinc-200 bg-white">
          <div class="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <h2 class="text-lg font-semibold text-zinc-950">Members</h2>
            <Button onclick={() => (showInvite = !showInvite)} variant="outline" size="sm">
              <Icon icon="solar:user-plus-bold-duotone" class="mr-1.5 size-4" />
              Invite
            </Button>
          </div>

          {#if showInvite}
            <div class="border-b border-zinc-100 px-6 py-4">
              {#if inviteError}<p class="mb-2 text-sm text-destructive">{inviteError}</p>{/if}
              {#if inviteSuccess}<p class="mb-2 text-sm text-emerald-600">{inviteSuccess}</p>{/if}
              <form onsubmit={handleInvite} class="flex items-end gap-3">
                <div class="flex-1 space-y-1.5">
                  <Label for="invite-email">Email</Label>
                  <Input id="invite-email" type="email" bind:value={inviteEmail} placeholder="colleague@company.com" disabled={inviting} />
                </div>
                <div class="space-y-1.5">
                  <Label for="invite-role">Role</Label>
                  <select id="invite-role" bind:value={inviteRole} class="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm" disabled={inviting}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? 'Sending...' : 'Send invite'}
                </Button>
              </form>
            </div>
          {/if}

          {#if loading}
            <div class="p-6 text-center text-sm text-zinc-400">Loading...</div>
          {:else if members.length === 0}
            <div class="p-6 text-center text-sm text-zinc-400">No members.</div>
          {:else}
            <div class="divide-y divide-zinc-100">
              {#each members as member}
                <div class="flex items-center gap-4 px-6 py-3">
                  <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                    {member.name?.slice(0, 2).toUpperCase() ?? member.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-zinc-950">{member.name || member.email}</p>
                    <p class="truncate text-xs text-zinc-500">{member.email}</p>
                  </div>
                  <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium {member.role === 'owner' ? 'border-amber-200 bg-amber-50 text-amber-700' : member.role === 'admin' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}">{member.role}</span>
                  {#if member.role !== 'owner' && member.user_id !== auth.user?.id}
                    <div class="flex gap-1">
                      <button onclick={() => handleChangeRole(member.id, member.role)} class="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700" title="Toggle admin">
                        <Icon icon="solar:shield-bold-duotone" class="size-4" />
                      </button>
                      <button onclick={() => handleRemoveMember(member.id, member.email)} class="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Remove member">
                        <Icon icon="solar:trash-bin-trash-bold-duotone" class="size-4" />
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#if auth.workspaces.length > 1}
          <div class="rounded-lg border border-zinc-200 bg-white">
            <div class="border-b border-zinc-100 px-6 py-4">
              <h2 class="text-lg font-semibold text-zinc-950">All workspaces</h2>
            </div>
            <div class="divide-y divide-zinc-100">
              {#each auth.workspaces as ws}
                {@const active = ws.id === auth.workspace?.id}
                <button onclick={() => { if (!active) handleSwitchWorkspace(ws.id); }} class="flex w-full items-center gap-4 px-6 py-3 text-left transition-colors {active ? 'bg-zinc-50' : 'hover:bg-zinc-50'}" disabled={active}>
                  <Icon icon={active ? 'solar:check-circle-bold' : 'solar:buildings-linear'} class="size-5 shrink-0 {active ? 'text-emerald-500' : 'text-zinc-300'}" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-zinc-950">{ws.name}</p>
                    <p class="text-xs text-zinc-500">{ws.slug}</p>
                  </div>
                  <span class="text-xs text-zinc-400">{ws.role}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

      {:else if tab === 'settings'}
        {#if settingsLoading}
          <div class="flex items-center justify-center py-16"><span class="text-sm text-zinc-400">Loading settings...</span></div>
        {:else}
          <div class="flex items-center justify-between mb-4">
            <p class="text-xs text-zinc-400">Settings cascade: <strong>workspace</strong> overrides <strong>system</strong> overrides <strong>env</strong> overrides <strong>defaults</strong>.</p>
            <Button variant="default" size="sm" onclick={saveSettings} disabled={settingsSaving} class="rounded-xl gap-2">
              <Icon icon={settingsSaved ? 'solar:check-circle-bold-duotone' : 'solar:diskette-bold-duotone'} class="size-4" />
              {settingsSaving ? 'Saving...' : settingsSaved ? 'Saved!' : 'Save'}
            </Button>
          </div>

          {#if settingsError}<p class="mb-4 text-sm text-destructive">{settingsError}</p>{/if}

          {#each [
            { title: 'Ingest', keys: ingestSection },
            { title: 'API Keys', keys: apiKeySection },
            { title: 'Models', keys: modelSection },
            { title: 'System', keys: systemSection },
            { title: 'Notifications', keys: notificationsSection },
          ] as section}
            <section>
              <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">{section.title}</h2>
              <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
                {#each section.keys as key}
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
                        type={SENSITIVE_KEYS.has(key) && !showSensitive[key] ? 'password' : 'text'}
                        bind:value={edits[key]}
                        placeholder="Enter value..."
                        class="font-mono text-sm rounded-xl flex-1"
                      />
                      {#if SENSITIVE_KEYS.has(key)}
                        <Button variant="outline" size="icon" onclick={() => (showSensitive[key] = !showSensitive[key])} class="shrink-0 rounded-xl" title={showSensitive[key] ? 'Hide' : 'Show'}>
                          <Icon icon={showSensitive[key] ? 'solar:eye-closed-bold-duotone' : 'solar:eye-bold-duotone'} class="size-4" />
                        </Button>
                      {/if}
                      {#if sources[key] === 'workspace'}
                        <Button variant="ghost" size="sm" onclick={() => clearSetting(key)} class="shrink-0 rounded-xl text-zinc-400 hover:text-red-500" title="Clear workspace override">
                          <Icon icon="solar:trash-bin-minimalistic-bold-duotone" class="size-4" />
                        </Button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </Card>
            </section>
          {/each}
        {/if}

      {:else if tab === 'workers'}
        <section>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100 mb-6">
            <div class="px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <span class="text-sm font-medium text-zinc-900">Re-embed all events</span>
                  <p class="text-xs text-zinc-400 mt-0.5">Reset all embeddings and re-generate.</p>
                </div>
                <Button variant="outline" size="sm" onclick={() => { confirmAction = 'reembed'; }} disabled={reembedding} class="shrink-0 rounded-xl gap-1.5">
                  <Icon icon="solar:refresh-bold-duotone" class="size-3.5" />
                  {reembedding ? 'Processing...' : 'Re-embed'}
                </Button>
              </div>
              {#if reembedResult}<p class="mt-2 text-xs text-emerald-600">{reembedResult}</p>{/if}
              {#if embeddingStats}
                <div class="mt-3 space-y-1.5">
                  <div class="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{embeddingStats.ready}/{embeddingStats.total} ready {#if embeddingStats.pending + embeddingStats.locked > 0}<span class="text-amber-500">· {embeddingStats.pending + embeddingStats.locked} queued</span>{/if}</span>
                    {#if embeddingProgress !== null}<span class="font-mono">{embeddingProgress}%</span>{/if}
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div class="h-full rounded-full transition-all duration-500 {embeddingBusy ? 'bg-amber-400' : 'bg-emerald-400'}" style="width: {embeddingProgress ?? 0}%"></div>
                  </div>
                </div>
              {/if}
            </div>
            <div class="px-5 py-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <span class="text-sm font-medium text-zinc-900">Reprocess entities</span>
                  <p class="text-xs text-zinc-400 mt-0.5">Re-extract actors, re-run ontology labeling, rebuild relations.</p>
                </div>
                <Button variant="outline" size="sm" onclick={() => { confirmAction = 'reprocess'; }} disabled={reprocessing} class="shrink-0 rounded-xl gap-1.5">
                  <Icon icon="solar:graph-new-bold-duotone" class="size-3.5" />
                  {reprocessing ? 'Processing...' : 'Reprocess'}
                </Button>
              </div>
              {#if reprocessResult}<p class="mt-2 text-xs text-emerald-600">{reprocessResult}</p>{/if}
            </div>
          </Card>

          <div class="mb-3 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Background Workers</h2>
              {#if workersPaused}<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600"><Icon icon="solar:pause-bold" class="size-2.5" />paused</span>{/if}
            </div>
            <div class="flex items-center gap-2">
              <button onclick={toggleWorkersPaused} disabled={togglingPause} class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors {workersPaused ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}">
                <Icon icon={workersPaused ? 'solar:play-bold' : 'solar:pause-bold'} class="size-3" />
                {togglingPause ? '...' : workersPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100 {workersPaused ? 'opacity-60' : ''}">
            {#if workersLoading}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">Loading workers...</div>
            {:else}
              {#each workersList as worker}
                <div class="px-5 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="flex size-7 shrink-0 items-center justify-center rounded-lg {worker.status === 'running' ? 'bg-amber-50 text-amber-500' : worker.lastRun?.status === 'error' ? 'bg-red-50 text-red-400' : 'bg-emerald-50 text-emerald-500'}">
                        <Icon icon="solar:bolt-bold-duotone" class="size-3.5" />
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-zinc-900">{worker.name}</span>
                          <span class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium {worker.status === 'running' ? 'bg-amber-50 text-amber-600' : worker.lastRun?.status === 'error' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}">
                            {worker.status === 'running' ? 'running' : worker.lastRun?.status === 'error' ? 'error' : 'idle'}
                          </span>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-3 text-[11px] text-zinc-400">
                          <span>every {formatInterval(worker.intervalMs)}</span>
                          {#if worker.lastRun}<span>{timeAgo(worker.lastRun.started_at)}</span><span>{formatDuration(worker.lastRun.duration_ms)}</span>{/if}
                          {#if worker.totalRuns > 0}<span>{worker.totalRuns} runs{#if worker.totalErrors > 0}<span class="text-red-400"> · {worker.totalErrors} err</span>{/if}</span>{/if}
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onclick={() => triggerWorker(worker.name)} disabled={worker.status === 'running' || triggeringWorker === worker.name} class="shrink-0 rounded-xl gap-1.5">
                      <Icon icon="solar:play-bold-duotone" class="size-3.5" />
                      {triggeringWorker === worker.name ? '...' : 'Run'}
                    </Button>
                  </div>
                </div>
              {/each}
            {/if}
          </Card>
        </section>

      {:else if tab === 'health'}
        <section>
          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Knowledge Graph Health</h2>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100 mb-6">
            {#if healthLoading}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">Loading...</div>
            {:else if !graphHealth}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">No graph health data yet.</div>
            {:else}
              <div class="px-5 py-4">
                <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div><p class="text-[11px] text-zinc-400 uppercase">Nodes</p><p class="text-lg font-semibold text-zinc-900">{graphHealth.node_count}</p></div>
                  <div><p class="text-[11px] text-zinc-400 uppercase">Edges</p><p class="text-lg font-semibold text-zinc-900">{graphHealth.edge_count}</p></div>
                  <div><p class="text-[11px] text-zinc-400 uppercase">Entropy</p><p class="text-lg font-semibold text-zinc-900">{graphHealth.degree_entropy.toFixed(2)} <span class="text-xs text-zinc-400">bits</span></p></div>
                  <div><p class="text-[11px] text-zinc-400 uppercase">LCC</p><p class="text-lg font-semibold {graphHealth.largest_component_ratio > 0.6 ? 'text-emerald-600' : 'text-amber-600'}">{(graphHealth.largest_component_ratio * 100).toFixed(0)}%</p></div>
                </div>
              </div>
              {#if isolatedEntities.length > 0}
                <div class="px-5 py-4">
                  <p class="text-xs font-medium text-zinc-500 mb-2">Isolated entities ({isolatedEntities.length})</p>
                  <div class="max-h-48 overflow-y-auto space-y-1.5">
                    {#each isolatedEntities as entity}
                      <div class="flex items-center justify-between text-xs">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="size-2 rounded-full bg-red-300 shrink-0"></span>
                          <span class="truncate text-zinc-700">{entity.name}</span>
                          <span class="shrink-0 text-[10px] text-zinc-400">{entity.type}</span>
                        </div>
                        <span class="shrink-0 text-zinc-400">{entity.event_count} events</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          </Card>

          <h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Concept Drift Alerts</h2>
          <Card class="rounded-[20px] border-zinc-200/80 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.3)] divide-y divide-zinc-100">
            {#if driftLoading}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">Loading...</div>
            {:else if driftAlerts.length === 0}
              <div class="px-5 py-8 text-center text-sm text-zinc-400">No drift detected.</div>
            {:else}
              {#each driftAlerts as alert}
                <div class="px-5 py-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <Icon icon="solar:danger-triangle-bold-duotone" class="size-4 text-amber-500 shrink-0" />
                        <span class="text-sm font-medium text-zinc-900">{alert.provider_type}</span>
                        <span class="text-[10px] text-zinc-400">· {alert.field_name}</span>
                      </div>
                      <p class="mt-1 text-xs text-zinc-500">Drift score: <span class="font-mono font-medium text-amber-600">{alert.drift_score.toFixed(3)}</span></p>
                    </div>
                    <span class="shrink-0 text-[10px] text-zinc-400">{timeAgo(alert.detected_at)}</span>
                  </div>
                </div>
              {/each}
            {/if}
          </Card>
        </section>
      {/if}
    </div>
  </div>

  {#if confirmAction}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div class="mx-4 w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
        <p class="text-sm font-semibold text-zinc-900">{confirmAction === 'reembed' ? 'Re-embed all events?' : 'Reprocess entities?'}</p>
        <p class="mt-2 text-xs leading-relaxed text-zinc-500">
          {confirmAction === 'reembed' ? 'This will reset all embeddings and re-generate them.' : 'This re-processes all events. May consume LLM tokens.'}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onclick={() => { confirmAction = null; }} class="rounded-xl gap-1.5">Cancel</Button>
          <Button variant="default" size="sm" onclick={() => { const a = confirmAction; confirmAction = null; if (a === 'reembed') reembedAll(); else reprocessEntities(); }} class="rounded-xl gap-1.5">Confirm</Button>
        </div>
      </div>
    </div>
  {/if}
</div>
