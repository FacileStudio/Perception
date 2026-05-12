<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { GraphEntity, EntityRelation, CommunityDetail, EntityNarrativeDetail } from '$lib/api';
  import { buildTitle } from '$lib/head';
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import Icon from '@iconify/svelte';
  import { ensureSolar } from '$lib/solar';
  ensureSolar();

  const PAGE_SIZE = 20;

  let loading = $state(true);
  let empty = $state(false);
  let entityCount = $state(0);
  let relationCount = $state(0);
  let viewMode = $state<'list' | 'communities'>('list');
  let entityPage = $state(1);
  let communityPage = $state(1);

  let communities = $state<CommunityDetail[]>([]);
  let loadingCommunities = $state(false);
  let narrativesMap = $state<Map<string, EntityNarrativeDetail>>(new Map());

  let entities: GraphEntity[] = [];
  let relations: EntityRelation[] = [];

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

  function setMode(m: 'list' | 'communities') {
    viewMode = m;
    if (m === 'communities' && communities.length === 0) loadCommunities();
    if (m === 'list' && narrativesMap.size === 0) loadNarratives();
  }

  async function loadNarratives() {
    try {
      const data = await api.entities.narratives();
      const map = new Map<string, EntityNarrativeDetail>();
      for (const n of data.narratives) map.set(n.entity_id, n);
      narrativesMap = map;
    } catch {
      narrativesMap = new Map();
    }
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

  let entityTotalPages = $derived(Math.ceil(adjacency.length / PAGE_SIZE));
  let pagedAdjacency = $derived(adjacency.slice((entityPage - 1) * PAGE_SIZE, entityPage * PAGE_SIZE));

  let communityTotalPages = $derived(Math.ceil(communities.length / PAGE_SIZE));
  let pagedCommunities = $derived(communities.slice((communityPage - 1) * PAGE_SIZE, communityPage * PAGE_SIZE));

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
  <div class="border-b border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="flex gap-0.5 rounded-xl border border-zinc-200/80 bg-zinc-50 p-0.5">
        <button
          class="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'list' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
          onclick={() => setMode('list')}
        >
          <Icon icon="solar:list-linear" class="size-3.5" />
          Entities
        </button>
        <button
          class="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'communities' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
          onclick={() => setMode('communities')}
        >
          <Icon icon="solar:users-group-rounded-linear" class="size-3.5" />
          Communities
        </button>
      </div>
      <span class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-zinc-400 lg:ml-auto">
        <Icon icon="solar:graph-bold-duotone" class="size-4" />
        {entityCount} {entityCount === 1 ? 'entity' : 'entities'}
        {#if relationCount > 0}
          · {relationCount} {relationCount === 1 ? 'relation' : 'relations'}
        {/if}
      </span>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">Loading...</span>
      </div>
    {:else if empty}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-zinc-400">No entities resolved yet.</span>
      </div>
    {:else if viewMode === 'list'}
      <div class="flex flex-col gap-3">
        {#each pagedAdjacency as { entity, connections }}
          <Card class="rounded-[24px] border-zinc-200/80 p-4 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-2">
                <span class="size-2.5 shrink-0 rounded-full" style="background:{colorFor(entity.type_label)}"></span>
                <p class="text-sm font-medium text-zinc-900">{entity.canonical_name}</p>
                <Badge variant="secondary" class="font-mono">{entity.type_label}</Badge>
                <span class="ml-auto text-xs text-zinc-400">{entity.event_count} {entity.event_count === 1 ? 'event' : 'events'}</span>
              </div>
              {#if narrativesMap.has(entity.id)}
                <p class="text-sm text-zinc-500">{narrativesMap.get(entity.id)!.text}</p>
              {/if}
              {#if connections.length > 0}
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  {#each connections.slice(0, 8) as { other, label }}
                    <Badge variant="outline" class="font-mono">
                      {other.canonical_name}
                      <span class="ml-1 text-zinc-400">{label.replace(/_/g, ' ')}</span>
                    </Badge>
                  {/each}
                  {#if connections.length > 8}
                    <span class="text-xs text-zinc-400">+{connections.length - 8} more</span>
                  {/if}
                </div>
              {/if}
            </div>
          </Card>
        {/each}
      </div>
    {:else if viewMode === 'communities'}
      {#if loadingCommunities}
        <div class="flex items-center justify-center py-12">
          <span class="text-sm text-zinc-400">Loading...</span>
        </div>
      {:else if communities.length === 0}
        <div class="flex items-center justify-center py-12">
          <span class="text-sm text-zinc-400">No communities detected yet.</span>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each pagedCommunities as comm, ci}
            <Card class="rounded-[24px] border-zinc-200/80 p-4 shadow-[0_18px_48px_-40px_rgba(24,24,27,0.4)]">
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <Badge variant="secondary">{(communityPage - 1) * PAGE_SIZE + ci + 1}</Badge>
                  <p class="text-sm font-medium text-zinc-900">{comm.title}</p>
                  {#if comm.stale}
                    <Badge variant="outline" class="text-amber-600">stale</Badge>
                  {/if}
                  <span class="ml-auto text-xs text-zinc-400">
                    {comm.member_count} {comm.member_count === 1 ? 'entity' : 'entities'} · {(comm.importance * 100).toFixed(0)}%
                  </span>
                </div>
                <p class="text-sm text-zinc-500">{comm.summary}</p>
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  {#each comm.members.slice(0, 10) as member}
                    <Badge variant="outline" class="font-mono">
                      <span class="mr-1.5 size-1.5 shrink-0 rounded-full" style="background:{colorFor(member.type_label)}"></span>
                      {member.name}
                    </Badge>
                  {/each}
                  {#if comm.members.length > 10}
                    <span class="text-xs text-zinc-400">+{comm.members.length - 10} more</span>
                  {/if}
                </div>
                <span class="text-xs text-zinc-400">
                  {new Date(comm.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </Card>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if viewMode === 'list' && entityTotalPages > 1}
    <div class="border-t border-zinc-200/80 bg-white/90 px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={() => { if (entityPage > 1) entityPage -= 1; }} disabled={entityPage <= 1}>Prev</Button>
        <span class="text-xs text-zinc-500">Page {entityPage} of {entityTotalPages}</span>
        <Button variant="outline" size="sm" onclick={() => { if (entityPage < entityTotalPages) entityPage += 1; }} disabled={entityPage >= entityTotalPages}>Next</Button>
      </div>
    </div>
  {/if}

  {#if viewMode === 'communities' && communityTotalPages > 1}
    <div class="border-t border-zinc-200/80 bg-white/90 px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={() => { if (communityPage > 1) communityPage -= 1; }} disabled={communityPage <= 1}>Prev</Button>
        <span class="text-xs text-zinc-500">Page {communityPage} of {communityTotalPages}</span>
        <Button variant="outline" size="sm" onclick={() => { if (communityPage < communityTotalPages) communityPage += 1; }} disabled={communityPage >= communityTotalPages}>Next</Button>
      </div>
    </div>
  {/if}
</div>
