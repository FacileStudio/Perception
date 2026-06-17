<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, type ResourceRow, type ResourceDetail } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  ensureSolar();

  let resources = $state<ResourceRow[]>([]);
  let loading = $state(false);
  let error = $state('');
  let uploading = $state(false);
  let deleting = $state<string | null>(null);
  let confirmDelete = $state<string | null>(null);
  let showUpload = $state(false);
  let fileInput: HTMLInputElement | undefined;
  let pendingFiles = $state.raw<File[]>([]);
  let detail = $state<ResourceDetail | null>(null);
  let detailLoading = $state(false);
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const MIME_ICONS: Record<string, string> = {
    'application/pdf': 'solar:document-linear',
    'text/plain': 'solar:text-linear',
    'text/markdown': 'solar:text-linear',
    'text/csv': 'solar:chart-linear',
    'application/json': 'solar:code-linear',
  };

  const STATUS_STYLE: Record<string, { label: string; class: string }> = {
    processing: { label: 'Processing', class: 'bg-amber-50 text-amber-600 border-amber-200/60' },
    ready: { label: 'Ready', class: 'bg-emerald-50 text-emerald-600 border-emerald-200/60' },
    error: { label: 'Error', class: 'bg-red-50 text-red-500 border-red-200/60' },
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function timeAgo(iso: string): string {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function hasProcessing(): boolean {
    return resources.some((r) => r.status === 'processing');
  }

  function startPolling() {
    stopPolling();
    if (!hasProcessing()) return;
    pollTimer = setInterval(async () => {
      try {
        const result = await api.resources.list();
        resources = result.resources;
        if (!hasProcessing()) stopPolling();
      } catch {}
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const result = await api.resources.list();
      resources = result.resources;
      startPolling();
    } catch (e) {
      console.error('[resources] load failed:', e);
      error = 'Failed to load resources.';
    } finally {
      loading = false;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (!input.files?.length) return;
    pendingFiles = Array.from(input.files);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.substring(result.indexOf(',') + 1));
      };
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function handleUpload() {
    if (!pendingFiles.length || uploading) return;
    uploading = true;
    error = '';
    try {
      const encoded: Array<{ name: string; type: string; data: string }> = [];
      for (const f of pendingFiles) {
        const data = await fileToBase64(f);
        encoded.push({ name: f.name, type: f.type, data });
      }
      await api.resources.upload(encoded);
      showUpload = false;
      pendingFiles = [];
      await load();
    } catch (e) {
      console.error('[resources] upload failed:', e);
      error = e instanceof Error ? e.message : 'Upload failed.';
    } finally {
      uploading = false;
    }
  }

  async function handleDelete(id: string) {
    deleting = id;
    try {
      await api.resources.delete(id);
      resources = resources.filter(r => r.id !== id);
      if (detail?.id === id) detail = null;
    } catch (e) {
      console.error('[resources] delete failed:', e);
      error = 'Delete failed.';
    } finally {
      deleting = null;
      confirmDelete = null;
    }
  }

  async function openDetail(id: string) {
    detailLoading = true;
    try {
      detail = await api.resources.get(id);
    } catch (e) {
      console.error('[resources] detail load failed:', e);
      error = 'Failed to load resource details.';
    } finally {
      detailLoading = false;
    }
  }

  function closeDetail() {
    detail = null;
  }

  onMount(() => {
    load();
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

<svelte:head>
  <title>{buildTitle('Resources')}</title>
  <meta name="description" content="Upload and manage knowledge documents" />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon icon="solar:documents-linear" class="size-4" />
        Resources
      </span>
      {#if resources.length > 0}
        <span class="text-xs text-muted-foreground">{resources.length} documents</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="rounded-full text-xs"
        onclick={() => load()}
        disabled={loading}
      >
        <Icon icon="solar:refresh-linear" class="mr-1.5 size-3.5" />
        Refresh
      </Button>
      <Button
        size="sm"
        class="rounded-full text-xs bg-primary text-primary-foreground hover:bg-primary/90"
        onclick={() => (showUpload = !showUpload)}
      >
        <Icon icon="solar:upload-linear" class="mr-1.5 size-3.5" />
        Upload
      </Button>
    </div>
  </div>

  {#if showUpload}
    <div class="border-b border-border bg-muted/50 px-4 py-4 sm:px-6" transition:fly={{ y: -10, duration: 200 }}>
      <div class="flex items-center gap-3">
        <button
          onclick={() => fileInput?.click()}
          class="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/50 bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Icon icon="solar:file-download-linear" class="size-5" />
          {#if pendingFiles.length > 1}
            {pendingFiles.length} files selected ({formatSize(pendingFiles.reduce((s, f) => s + f.size, 0))})
          {:else if pendingFiles.length === 1}
            {pendingFiles[0].name} ({formatSize(pendingFiles[0].size)})
          {:else}
            Choose files (PDF, text, markdown, CSV, JSON)
          {/if}
        </button>
        <input
          bind:this={fileInput}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
          onchange={handleFileSelect}
          class="hidden"
        />
        <Button
          size="sm"
          class="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={pendingFiles.length === 0 || uploading}
          onclick={handleUpload}
        >
          {#if uploading}
            Processing...
          {:else}
            Upload
          {/if}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="rounded-full"
          onclick={() => { showUpload = false; pendingFiles = []; }}
        >
          Cancel
        </Button>
      </div>
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-muted-foreground">Loading resources...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-linear" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if resources.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-20">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon icon="solar:documents-linear" class="size-7 text-muted-foreground/50" />
        </div>
        <span class="text-sm text-muted-foreground">No resources yet</span>
        <span class="text-xs text-muted-foreground/50">Upload documents to add them to Perception's knowledge base</span>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each resources as resource (resource.id)}
          {@const statusStyle = STATUS_STYLE[resource.status] ?? STATUS_STYLE.ready}
          {@const mimeIcon = MIME_ICONS[resource.mime_type] ?? 'solar:document-linear'}
          <Card
            class="group relative cursor-pointer rounded-[20px] border border-border/60 p-4 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.15)] transition-all hover:shadow-[0_12px_32px_-12px_rgba(24,24,27,0.2)]"
          >
            <button class="flex w-full items-start gap-3.5 text-left" onclick={() => openDetail(resource.id)}>
              <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon icon={mimeIcon} class="size-5 text-muted-foreground" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold text-foreground">{resource.title}</h3>
                    {#if resource.description}
                      <p class="mt-0.5 truncate text-xs text-muted-foreground">{resource.description}</p>
                    {/if}
                  </div>
                  <span class="shrink-0 text-xs text-muted-foreground">{timeAgo(resource.uploaded_at)}</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium {statusStyle.class}">
                    {statusStyle.label}
                  </span>
                  <span class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatSize(resource.file_size)}
                  </span>
                  {#if resource.chunk_count > 0}
                    <span class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {resource.chunk_count} chunks
                    </span>
                  {/if}
                  <span class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {resource.mime_type.split('/')[1]}
                  </span>
                </div>
              </div>
            </button>
            {#if confirmDelete !== resource.id}
              <button
                onclick={(e) => { e.stopPropagation(); confirmDelete = resource.id; }}
                class="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                title="Delete resource"
                disabled={deleting === resource.id}
              >
                <Icon icon="solar:trash-bin-trash-linear" class="size-4" />
              </button>
            {/if}

            {#if confirmDelete === resource.id}
              <div
                class="absolute inset-0 z-10 flex items-center justify-between gap-3 rounded-[20px] bg-background/95 px-4 backdrop-blur-sm"
                transition:fade={{ duration: 120 }}
              >
                <span class="min-w-0 truncate text-sm text-muted-foreground">
                  Delete <span class="font-semibold text-foreground">{resource.title}</span>?
                </span>
                <div class="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    class="rounded-full text-xs"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); confirmDelete = null; }}
                    disabled={deleting === resource.id}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    class="rounded-full bg-red-600 text-xs text-white hover:bg-red-700"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); handleDelete(resource.id); }}
                    disabled={deleting === resource.id}
                  >
                    {#if deleting === resource.id}
                      Deleting...
                    {:else}
                      Delete
                    {/if}
                  </Button>
                </div>
              </div>
            {/if}
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if detail}
  <div
    class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
    role="button"
    tabindex="-1"
    onclick={closeDetail}
    onkeydown={(e) => e.key === 'Escape' && closeDetail()}
    transition:fade={{ duration: 150 }}
  ></div>
  <div
    class="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl"
    in:fly={{ x: 420, duration: 280, easing: cubicOut }}
    out:fly={{ x: 420, duration: 200 }}
  >
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <div class="flex items-center gap-3 min-w-0">
        <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon icon={MIME_ICONS[detail.mime_type] ?? 'solar:document-linear'} class="size-4.5 text-muted-foreground" />
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold text-foreground">{detail.title}</h2>
          <p class="text-xs text-muted-foreground">{formatSize(detail.file_size)} — {detail.chunk_count} chunks</p>
        </div>
      </div>
      <button
        onclick={closeDetail}
        class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Icon icon="solar:close-circle-linear" class="size-5" />
      </button>
    </div>

    {#if detail.description}
      <div class="border-b border-border/50 px-5 py-3">
        <p class="text-xs text-muted-foreground">{detail.description}</p>
      </div>
    {/if}

    <div class="flex items-center gap-2 border-b border-border/50 px-5 py-3">
      <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium {(STATUS_STYLE[detail.status] ?? STATUS_STYLE.ready).class}">
        {(STATUS_STYLE[detail.status] ?? STATUS_STYLE.ready).label}
      </span>
      <span class="text-[10px] text-muted-foreground">Uploaded {timeAgo(detail.uploaded_at)}</span>
      {#if detail.error}
        <span class="text-[10px] text-red-500">{detail.error}</span>
      {/if}
      {#if detail.has_file}
        <a
          href={api.resources.downloadUrl(detail.id)}
          class="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          download
        >
          <Icon icon="solar:download-linear" class="size-3.5" />
          Download
        </a>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      {#if detailLoading}
        <div class="flex items-center justify-center py-12">
          <span class="text-sm text-muted-foreground">Loading...</span>
        </div>
      {:else if detail.chunks.length === 0}
        <div class="flex flex-col items-center justify-center gap-2 py-12">
          <Icon icon="solar:document-linear" class="size-6 text-muted-foreground/50" />
          <span class="text-xs text-muted-foreground">No chunks yet — document is still processing</span>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each detail.chunks as chunk (chunk.id)}
            <div class="rounded-xl border border-border/60 bg-muted/50 p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[10px] font-medium text-muted-foreground">Chunk {chunk.chunk_index + 1}</span>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-muted-foreground">{chunk.token_count} tokens</span>
                  <span class="size-1.5 rounded-full {chunk.embedding_status === 'ready' ? 'bg-emerald-400' : chunk.embedding_status === 'error' ? 'bg-red-400' : 'bg-amber-400'}"></span>
                </div>
              </div>
              <p class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{chunk.content.length > 500 ? chunk.content.slice(0, 500) + '...' : chunk.content}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
