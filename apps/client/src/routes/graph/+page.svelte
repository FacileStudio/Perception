<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { GraphEntity, EntityRelation, CommunityDetail, EntityNarrativeDetail } from '$lib/api';
  import { buildTitle } from '$lib/head';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  ensureSolar();

  let loading = $state(true);
  let empty = $state(false);
  let entityCount = $state(0);
  let relationCount = $state(0);
  let viewMode = $state<'list' | 'communities'>('list');
  let communities = $state<CommunityDetail[]>([]);
  let loadingCommunities = $state(false);
  let narrativesMap = $state<Map<string, EntityNarrativeDetail>>(new Map());
  let loadingNarratives = $state(false);

  let entities: GraphEntity[] = [];
  let relations: EntityRelation[] = [];

  function setMode(m: 'list' | 'communities') {
    viewMode = m;
    if (m === 'communities' && communities.length === 0) loadCommunities();
    if (m === 'list' && narrativesMap.size === 0) loadNarratives();
  }

  async function loadNarratives() {
    loadingNarratives = true;
    try {
      const data = await api.entities.narratives();
      const map = new Map<string, EntityNarrativeDetail>();
      for (const n of data.narratives) map.set(n.entity_id, n);
      narrativesMap = map;
    } catch {
      narrativesMap = new Map();
    }
    loadingNarratives = false;
  }

  async function loadCommunities() {
    loadingCommunities = true;
    try {
      const data = await api.entities.communities();
      communities = data.communities;
    } catch {
      communities = [];
    }
    loadingCommunities = false;
  }

  const COLORS: [string, string][] = [
    ['deployment', '#6366f1'],
    ['service', '#6366f1'],
    ['monitor', '#6366f1'],
    ['contract', '#7c3aed'],
    ['document', '#7c3aed'],
    ['submission', '#7c3aed'],
    ['client', '#059669'],
    ['organization', '#059669'],
    ['company', '#059669'],
    ['account', '#059669'],
    ['task', '#2563eb'],
    ['work_item', '#2563eb'],
    ['issue', '#2563eb'],
    ['person', '#db2777'],
    ['contact', '#db2777'],
    ['signer', '#db2777'],
    ['invoice', '#d97706'],
    ['payment', '#d97706'],
    ['financial', '#d97706'],
  ];

  function colorFor(label: string): string {
    for (const [key, color] of COLORS) {
      if (label.includes(key)) return color;
    }
    return '#6b7280';
  }

  let adjacency = $derived.by(() => {
    const entityMap = new Map<string, GraphEntity>();
    for (const e of entities) entityMap.set(e.id, e);
    const adjMap = new Map<string, { other: GraphEntity; label: string }[]>();
    for (const e of entities) adjMap.set(e.id, []);
    for (const rel of relations) {
      const source = entityMap.get(rel.from_id);
      const target = entityMap.get(rel.to_id);
      if (!source || !target) continue;
      adjMap.get(rel.from_id)?.push({ other: target, label: rel.label });
      adjMap.get(rel.to_id)?.push({ other: source, label: rel.label });
    }
    return entities
      .map((entity) => ({ entity, connections: adjMap.get(entity.id) ?? [] }))
      .sort((a, b) => b.entity.event_count - a.entity.event_count);
  });

  async function loadGraph() {
    try {
      const data = await api.entities.graph();
      entities = data.entities;
      relations = data.relations;
      entityCount = entities.length;
      relationCount = relations.length;
      empty = entities.length === 0;
    } catch {
      empty = true;
    }
    loading = false;
    if (!empty) loadNarratives();
  }

  onMount(() => {
    loadGraph();
  });
</script>

<svelte:head>
  <title>{buildTitle('Graph')}</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="shrink-0 border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm font-medium text-zinc-900">Entity Graph</span>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
        {entityCount} {entityCount === 1 ? 'entity' : 'entities'}
      </span>
      {#if relationCount > 0}
        <span class="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
          {relationCount} {relationCount === 1 ? 'relation' : 'relations'}
        </span>
      {/if}
      <div class="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
        {#if viewMode === 'communities'}
          <span>{communities.length} {communities.length === 1 ? 'community' : 'communities'}</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="relative min-h-0 flex-1 bg-[#f4f4f5]">
    <div class="absolute left-3 top-3 z-20 flex gap-0.5 rounded-xl border border-zinc-200/80 bg-white/80 p-0.5 shadow-sm backdrop-blur-md">
      <button
        class="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'list' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
        onclick={() => setMode('list')}
      >
        <Icon icon="solar:list-linear" class="size-3.5" />
        List
      </button>
      <button
        class="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'communities' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
        onclick={() => setMode('communities')}
      >
        <Icon icon="solar:users-group-rounded-linear" class="size-3.5" />
        Communities
      </button>
    </div>

    {#if loading}
      <div class="flex items-center justify-center pt-20">
        <Icon icon="solar:refresh-bold-duotone" class="size-5 animate-spin text-zinc-400" />
      </div>
    {:else if empty}
      <div class="flex flex-col items-center justify-center gap-2 pt-20 text-center">
        <span class="text-sm text-zinc-500">No entities resolved yet.</span>
        <span class="text-xs text-zinc-400">Entities appear here as events are ingested.</span>
      </div>
    {:else if viewMode === 'list'}
      <div class="absolute inset-0 overflow-y-auto p-4 pt-16">
        <div class="mx-auto max-w-2xl space-y-2 pb-4">
          {#each adjacency as { entity, connections }}
            <div class="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
              <div class="flex items-center gap-2.5">
                <span class="size-2.5 shrink-0 rounded-full" style="background:{colorFor(entity.type_label)}"></span>
                <span class="text-sm font-medium text-zinc-900">{entity.canonical_name}</span>
                <span class="ml-auto font-mono text-[11px] text-zinc-400">{entity.type_label}</span>
                <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">{entity.event_count} {entity.event_count === 1 ? 'event' : 'events'}</span>
              </div>
              {#if narrativesMap.has(entity.id)}
                <p class="mt-2 border-t border-emerald-100 pt-2 text-xs leading-relaxed text-emerald-700">
                  {narrativesMap.get(entity.id)!.text}
                </p>
              {/if}
              {#if connections.length > 0}
                <div class="mt-2 space-y-1 border-t border-zinc-100 pt-2">
                  {#each connections as { other, label }}
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-zinc-300">→</span>
                      <span class="font-medium text-zinc-700">{other.canonical_name}</span>
                      <span class="ml-auto font-mono text-[10px] text-zinc-400">{label.replace(/_/g, ' ')}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {:else if viewMode === 'communities'}
      <div class="absolute inset-0 overflow-y-auto p-4 pt-16">
        <div class="mx-auto max-w-2xl space-y-3 pb-4">
          {#if loadingCommunities}
            <div class="flex items-center justify-center py-16">
              <Icon icon="solar:refresh-bold-duotone" class="size-5 animate-spin text-zinc-400" />
            </div>
          {:else if communities.length === 0}
            <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Icon icon="solar:users-group-rounded-bold-duotone" class="size-10 text-zinc-300" />
              <p class="text-sm text-zinc-500">No communities detected yet.</p>
              <p class="text-xs text-zinc-400">Run the communities worker from Settings to generate clusters.</p>
            </div>
          {:else}
            {#each communities as comm, ci}
              <div class="rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
                <div class="flex items-start gap-3 px-5 py-4">
                  <span class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-600">
                    {ci + 1}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-zinc-900">{comm.title}</span>
                      {#if comm.stale}
                        <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">stale</span>
                      {/if}
                    </div>
                    <p class="mt-1 text-xs leading-relaxed text-zinc-500">{comm.summary}</p>
                    <div class="mt-2.5 flex flex-wrap gap-1.5">
                      {#each comm.members as member}
                        <span class="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                          <span class="size-1.5 shrink-0 rounded-full" style="background:{colorFor(member.type_label)}"></span>
                          {member.name}
                        </span>
                      {/each}
                    </div>
                    <div class="mt-2.5 flex items-center gap-3 text-[11px] text-zinc-400">
                      <span class="font-mono">{comm.member_count} entities</span>
                      <span>importance {(comm.importance * 100).toFixed(0)}%</span>
                      <span>{new Date(comm.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
