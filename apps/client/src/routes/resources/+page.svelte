<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type ResourceRow, type ResourceDetail } from '$lib/api';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
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
  let showUpload = $state(false);
  let uploadTitle = $state('');
  let uploadDescription = $state('');
  let fileInput = $state<HTMLInputElement | undefined>();
  let selectedFile = $state<File | null>(null);
  let detail = $state<ResourceDetail | null>(null);
  let detailLoading = $state(false);

  const MIME_ICONS: Record<string, string> = {
    'application/pdf': 'solar:document-bold-duotone',
    'text/plain': 'solar:text-bold-duotone',
    'text/markdown': 'solar:text-bold-duotone',
    'text/csv': 'solar:chart-bold-duotone',
    'application/json': 'solar:code-bold-duotone',
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

  async function load() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const result = await api.resources.list();
      resources = result.resources;
    } catch {
      error = 'Failed to load resources.';
    } finally {
      loading = false;
    }
  }

  function handleFileSelect() {
    if (fileInput?.files?.[0]) {
      selectedFile = fileInput.files[0];
      if (!uploadTitle) uploadTitle = selectedFile.name;
    }
  }

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    uploading = true;
    try {
      await api.resources.upload(selectedFile, uploadTitle, uploadDescription);
      showUpload = false;
      selectedFile = null;
      uploadTitle = '';
      uploadDescription = '';
      await load();
    } catch {
      error = 'Upload failed.';
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
    } catch {
      error = 'Delete failed.';
    } finally {
      deleting = null;
    }
  }

  async function openDetail(id: string) {
    detailLoading = true;
    try {
      detail = await api.resources.get(id);
    } catch {
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
</script>

<svelte:head>
  <title>{buildTitle('Resources')}</title>
  <meta name="description" content="Upload and manage knowledge documents" />
</svelte:head>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Icon icon="solar:documents-bold-duotone" class="size-4" />
        Resources
      </span>
      {#if resources.length > 0}
        <span class="text-xs text-zinc-400">{resources.length} documents</span>
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
        <Icon icon="solar:refresh-bold-duotone" class="mr-1.5 size-3.5" />
        Refresh
      </Button>
      <Button
        size="sm"
        class="rounded-full text-xs bg-zinc-950 text-white hover:bg-zinc-800"
        onclick={() => (showUpload = !showUpload)}
      >
        <Icon icon="solar:upload-bold-duotone" class="mr-1.5 size-3.5" />
        Upload
      </Button>
    </div>
  </div>

  {#if showUpload}
    <div class="border-b border-zinc-200/80 bg-zinc-50/50 px-4 py-4 sm:px-6" transition:fly={{ y: -10, duration: 200 }}>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <Input
              bind:value={uploadTitle}
              placeholder="Document title (optional)"
              class="rounded-xl text-sm"
            />
          </div>
          <div class="flex-1">
            <Input
              bind:value={uploadDescription}
              placeholder="Description (optional)"
              class="rounded-xl text-sm"
            />
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button
            onclick={() => fileInput?.click()}
            class="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
          >
            <Icon icon="solar:file-download-bold-duotone" class="size-5" />
            {#if selectedFile}
              {selectedFile.name} ({formatSize(selectedFile.size)})
            {:else}
              Choose a file (PDF, text, markdown, CSV, JSON)
            {/if}
          </button>
          <input
            bind:this={fileInput}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
            onchange={handleFileSelect}
            class="hidden"
          />
          <Button
            size="sm"
            class="rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
            disabled={!selectedFile || uploading}
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
            onclick={() => { showUpload = false; selectedFile = null; uploadTitle = ''; uploadDescription = ''; }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <span class="text-sm text-zinc-400">Loading resources...</span>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center gap-2 py-16">
        <Icon icon="solar:danger-triangle-bold-duotone" class="size-6 text-red-400" />
        <span class="text-sm text-red-500">{error}</span>
      </div>
    {:else if resources.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-20">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-zinc-100">
          <Icon icon="solar:documents-bold-duotone" class="size-7 text-zinc-300" />
        </div>
        <span class="text-sm text-zinc-400">No resources yet</span>
        <span class="text-xs text-zinc-300">Upload documents to add them to Perception's knowledge base</span>
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        {#each resources as resource (resource.id)}
          {@const statusStyle = STATUS_STYLE[resource.status] ?? STATUS_STYLE.ready}
          {@const mimeIcon = MIME_ICONS[resource.mime_type] ?? 'solar:document-bold-duotone'}
          <Card
            class="group relative cursor-pointer rounded-[20px] border border-zinc-200/60 p-4 shadow-[0_8px_24px_-16px_rgba(24,24,27,0.15)] transition-all hover:shadow-[0_12px_32px_-12px_rgba(24,24,27,0.2)]"
          >
            <button class="flex w-full items-start gap-3.5 text-left" onclick={() => openDetail(resource.id)}>
              <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                <Icon icon={mimeIcon} class="size-5 text-zinc-500" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold text-zinc-900">{resource.title}</h3>
                    {#if resource.description}
                      <p class="mt-0.5 truncate text-xs text-zinc-500">{resource.description}</p>
                    {/if}
                  </div>
                  <span class="shrink-0 text-xs text-zinc-400">{timeAgo(resource.uploaded_at)}</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium {statusStyle.class}">
                    {statusStyle.label}
                  </span>
                  <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {formatSize(resource.file_size)}
                  </span>
                  {#if resource.chunk_count > 0}
                    <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {resource.chunk_count} chunks
                    </span>
                  {/if}
                  <span class="rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                    {resource.mime_type.split('/')[1]}
                  </span>
                </div>
              </div>
            </button>
            <button
              onclick={(e) => { e.stopPropagation(); handleDelete(resource.id); }}
              class="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
              title="Delete resource"
              disabled={deleting === resource.id}
            >
              <Icon icon="solar:trash-bin-trash-bold-duotone" class="size-4" />
            </button>
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
    class="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl"
    in:fly={{ x: 420, duration: 280, easing: cubicOut }}
    out:fly={{ x: 420, duration: 200 }}
  >
    <div class="flex items-center justify-between border-b border-zinc-200/80 px-5 py-4">
      <div class="flex items-center gap-3 min-w-0">
        <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <Icon icon={MIME_ICONS[detail.mime_type] ?? 'solar:document-bold-duotone'} class="size-4.5 text-zinc-500" />
        </span>
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold text-zinc-900">{detail.title}</h2>
          <p class="text-xs text-zinc-400">{formatSize(detail.file_size)} — {detail.chunk_count} chunks</p>
        </div>
      </div>
      <button
        onclick={closeDetail}
        class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
      >
        <Icon icon="solar:close-circle-bold-duotone" class="size-5" />
      </button>
    </div>

    {#if detail.description}
      <div class="border-b border-zinc-100 px-5 py-3">
        <p class="text-xs text-zinc-500">{detail.description}</p>
      </div>
    {/if}

    <div class="flex items-center gap-2 border-b border-zinc-100 px-5 py-3">
      <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium {(STATUS_STYLE[detail.status] ?? STATUS_STYLE.ready).class}">
        {(STATUS_STYLE[detail.status] ?? STATUS_STYLE.ready).label}
      </span>
      <span class="text-[10px] text-zinc-400">Uploaded {timeAgo(detail.uploaded_at)}</span>
      {#if detail.error}
        <span class="text-[10px] text-red-500">{detail.error}</span>
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      {#if detailLoading}
        <div class="flex items-center justify-center py-12">
          <span class="text-sm text-zinc-400">Loading...</span>
        </div>
      {:else if detail.chunks.length === 0}
        <div class="flex flex-col items-center justify-center gap-2 py-12">
          <Icon icon="solar:document-bold-duotone" class="size-6 text-zinc-300" />
          <span class="text-xs text-zinc-400">No chunks yet — document is still processing</span>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each detail.chunks as chunk (chunk.id)}
            <div class="rounded-xl border border-zinc-200/60 bg-zinc-50/50 p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[10px] font-medium text-zinc-400">Chunk {chunk.chunk_index + 1}</span>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-zinc-400">{chunk.token_count} tokens</span>
                  <span class="size-1.5 rounded-full {chunk.embedding_status === 'ready' ? 'bg-emerald-400' : chunk.embedding_status === 'error' ? 'bg-red-400' : 'bg-amber-400'}"></span>
                </div>
              </div>
              <p class="whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">{chunk.content.length > 500 ? chunk.content.slice(0, 500) + '...' : chunk.content}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
