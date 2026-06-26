<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { GraphEntity, EntityRelation, CommunityDetail, EntityNarrativeDetail, EntityCommunity } from '$lib/api';
  import { buildTitle } from '$lib/head';
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Tabs, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
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

  let entities = $state<GraphEntity[]>([]);
  let relations = $state<EntityRelation[]>([]);

  let selectedId = $state<string | null>(null);
  let paneVisible = $state(false);
  let paneEntity = $state<GraphEntity | null>(null);
  let paneCommunity = $state<EntityCommunity | null>(null);
  let paneLoadingCommunity = $state(false);

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

  const colorMap = new Map(COLORS);
  function colorFor(label: string): string {
    for (const [key, color] of colorMap) {
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

  const entityMap = $derived.by(() => {
    const m = new Map<string, GraphEntity>();
    for (const e of entities) m.set(e.id, e);
    return m;
  });

  let adjacency = $derived.by(() => {
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

  const adjacencyById = $derived.by(() => {
    const m = new Map<string, { other: GraphEntity; label: string }[]>();
    for (const a of adjacency) m.set(a.entity.id, a.connections);
    return m;
  });

  let paneConnections = $derived(selectedId ? (adjacencyById.get(selectedId) ?? []) : []);
  let paneNarrative = $derived(selectedId ? narrativesMap.get(selectedId) ?? null : null);

  let entityTotalPages = $derived(Math.ceil(adjacency.length / PAGE_SIZE));
  let pagedAdjacency = $derived(adjacency.slice((entityPage - 1) * PAGE_SIZE, entityPage * PAGE_SIZE));

  let communityTotalPages = $derived(Math.ceil(communities.length / PAGE_SIZE));
  let pagedCommunities = $derived(communities.slice((communityPage - 1) * PAGE_SIZE, communityPage * PAGE_SIZE));

  function openEntity(id: string) {
    const entity = entityMap.get(id);
    if (!entity) return;

    selectedId = id;
    paneEntity = entity;
    paneCommunity = null;
    paneVisible = true;

    paneLoadingCommunity = true;
    api.entities.community(id)
      .then((data) => { paneCommunity = data.community; })
      .catch(() => { paneCommunity = null; })
      .finally(() => { paneLoadingCommunity = false; });
  }

  function closePane() {
    paneVisible = false;
    setTimeout(() => {
      selectedId = null;
      paneEntity = null;
      paneCommunity = null;
    }, 200);
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closePane();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && paneVisible) closePane();
  }

  async function loadGraph() {
    try {
      const [graphData, narrativesData] = await Promise.all([
        api.entities.graph(),
        api.entities.narratives(),
      ]);

      entities = graphData.entities;
      relations = graphData.relations;
      entityCount = entities.length;
      relationCount = relations.length;
      empty = entities.length === 0;

      if (!empty) {
        const map = new Map<string, EntityNarrativeDetail>();
        for (const n of narrativesData.narratives) map.set(n.entity_id, n);
        narrativesMap = map;
      }
    } catch {
      empty = true;
    }
    loading = false;
  }

  onMount(() => {
    loadGraph();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>{buildTitle('Entities')}</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Tabs value={viewMode} onValueChange={(v) => setMode(v as 'list' | 'communities')}>
        <TabsList>
          <TabsTrigger value="list">
            <Icon icon="solar:list-linear" class="size-3.5" />
            Entities
          </TabsTrigger>
          <TabsTrigger value="communities">
            <Icon icon="solar:users-group-rounded-linear" class="size-3.5" />
            Communities
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground lg:ml-auto">
        <Icon icon="solar:bill-list-linear" class="size-4" />
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
        <Icon icon="solar:spinner-line-duotone" class="size-5 text-muted-foreground animate-spin" />
      </div>
    {:else if empty}
      <div class="flex items-center justify-center py-12">
        <span class="text-sm text-muted-foreground">No entities resolved yet.</span>
      </div>
    {:else if viewMode === 'list'}
      <div class="flex flex-col gap-3">
        {#each pagedAdjacency as { entity, connections } (entity.id)}
          <button class="w-full text-left" onclick={() => openEntity(entity.id)}>
            <Card class="rounded-2xl border-border p-4 transition-colors hover:border-foreground/10">
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <span class="size-2.5 shrink-0 rounded-full" style="background:{colorFor(entity.type_label)}"></span>
                  <p class="text-sm font-medium text-foreground">{entity.canonical_name}</p>
                  <Badge variant="outline" class="font-mono text-xs">{entity.type_label}</Badge>
                  <span class="ml-auto text-xs text-muted-foreground">{entity.event_count} {entity.event_count === 1 ? 'event' : 'events'}</span>
                </div>
                {#if narrativesMap.has(entity.id)}
                  <p class="text-sm text-muted-foreground">{narrativesMap.get(entity.id)!.text}</p>
                {/if}
                {#if connections.length > 0}
                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    {#each connections.slice(0, 8) as { other, label }}
                      <Badge variant="outline" class="font-mono">
                        {other.canonical_name}
                        <span class="ml-1 text-muted-foreground">{label.replace(/_/g, ' ')}</span>
                      </Badge>
                    {/each}
                    {#if connections.length > 8}
                      <span class="text-xs text-muted-foreground">+{connections.length - 8} more</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </Card>
          </button>
        {/each}
      </div>
    {:else if viewMode === 'communities'}
      {#if loadingCommunities}
        <div class="flex items-center justify-center py-12">
          <Icon icon="solar:spinner-line-duotone" class="size-5 text-muted-foreground animate-spin" />
        </div>
      {:else if communities.length === 0}
        <div class="flex items-center justify-center py-12">
          <span class="text-sm text-muted-foreground">No communities detected yet.</span>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each pagedCommunities as comm, ci (comm.id)}
            <Card class="rounded-2xl border-border p-4 transition-colors hover:border-foreground/10">
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <Badge variant="secondary">{(communityPage - 1) * PAGE_SIZE + ci + 1}</Badge>
                  <p class="text-sm font-medium text-foreground">{comm.title}</p>
                  {#if comm.stale}
                    <Badge variant="outline" class="text-amber-600">stale</Badge>
                  {/if}
                  <span class="ml-auto text-xs text-muted-foreground">
                    {comm.member_count} {comm.member_count === 1 ? 'entity' : 'entities'} · {(comm.importance * 100).toFixed(0)}%
                  </span>
                </div>
                <p class="text-sm text-muted-foreground">{comm.summary}</p>
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  {#each comm.members.slice(0, 10) as member}
                    <button onclick={(e) => { e.stopPropagation(); openEntity(member.id); }}>
                      <Badge variant="outline" class="cursor-pointer font-mono transition-colors hover:border-foreground/30 hover:bg-accent">
                        <span class="mr-1.5 size-1.5 shrink-0 rounded-full" style="background:{colorFor(member.type_label)}"></span>
                        {member.name}
                      </Badge>
                    </button>
                  {/each}
                  {#if comm.members.length > 10}
                    <span class="text-xs text-muted-foreground">+{comm.members.length - 10} more</span>
                  {/if}
                </div>
                <span class="text-xs text-muted-foreground">
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
    <div class="border-t border-border bg-background/90 px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={() => { if (entityPage > 1) entityPage -= 1; }} disabled={entityPage <= 1}>Prev</Button>
        <span class="text-xs text-muted-foreground">Page {entityPage} of {entityTotalPages}</span>
        <Button variant="outline" size="sm" onclick={() => { if (entityPage < entityTotalPages) entityPage += 1; }} disabled={entityPage >= entityTotalPages}>Next</Button>
      </div>
    </div>
  {/if}

  {#if viewMode === 'communities' && communityTotalPages > 1}
    <div class="border-t border-border bg-background/90 px-4 py-3 sm:px-6">
      <div class="flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={() => { if (communityPage > 1) communityPage -= 1; }} disabled={communityPage <= 1}>Prev</Button>
        <span class="text-xs text-muted-foreground">Page {communityPage} of {communityTotalPages}</span>
        <Button variant="outline" size="sm" onclick={() => { if (communityPage < communityTotalPages) communityPage += 1; }} disabled={communityPage >= communityTotalPages}>Next</Button>
      </div>
    </div>
  {/if}
</div>

{#if selectedId}
  <div
    class="fixed inset-0 z-50 flex justify-end transition-colors duration-200 {paneVisible ? 'bg-black/20' : 'bg-transparent'}"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-label="Entity details"
  >
    <div
      class="flex h-full w-full max-w-md flex-col bg-background border-l border-border transition-transform duration-200 ease-out {paneVisible ? 'translate-x-0' : 'translate-x-full'}"
    >
      {#if paneEntity}
        <div class="flex items-center gap-3 border-b border-border px-5 py-4">
          <span class="size-3 shrink-0 rounded-full" style="background:{colorFor(paneEntity.type_label)}"></span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-foreground">{paneEntity.canonical_name}</p>
            <div class="flex items-center gap-2">
              <Badge variant="outline" class="font-mono text-xs">{paneEntity.type_label}</Badge>
              <span class="text-xs text-muted-foreground">{(paneEntity.confidence * 100).toFixed(0)}% confidence</span>
            </div>
          </div>
          <button onclick={closePane} class="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Icon icon="solar:close-circle-linear" class="size-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div class="flex flex-col gap-5">
            <div class="flex items-center gap-4 rounded-xl bg-muted px-4 py-3">
              <div class="text-center">
                <p class="text-lg font-semibold text-foreground">{paneEntity.event_count}</p>
                <p class="text-xs text-muted-foreground">events</p>
              </div>
              <div class="h-8 w-px bg-border"></div>
              <div class="text-center">
                <p class="text-lg font-semibold text-foreground">{paneConnections.length}</p>
                <p class="text-xs text-muted-foreground">connections</p>
              </div>
              <div class="h-8 w-px bg-border"></div>
              <div class="text-center">
                <p class="text-lg font-semibold text-foreground">{(paneEntity.confidence * 100).toFixed(0)}%</p>
                <p class="text-xs text-muted-foreground">confidence</p>
              </div>
            </div>

            {#if paneNarrative}
              <div>
                <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Narrative</p>
                <p class="text-sm leading-relaxed text-muted-foreground">{paneNarrative.text}</p>
                <p class="mt-1.5 text-xs text-muted-foreground">
                  Based on {paneNarrative.source_event_count} {paneNarrative.source_event_count === 1 ? 'event' : 'events'}
                  · {new Date(paneNarrative.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {#if paneNarrative.staleness_score > 0.5}
                    · <span class="text-amber-500">may be stale</span>
                  {/if}
                </p>
              </div>
            {/if}

            {#if paneLoadingCommunity}
              <div>
                <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Community</p>
                <Icon icon="solar:spinner-line-duotone" class="size-5 text-muted-foreground animate-spin" />
              </div>
            {:else if paneCommunity}
              <div>
                <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Community</p>
                <div class="rounded-xl border border-border p-3">
                  <p class="text-sm font-medium text-foreground">{paneCommunity.title}</p>
                  <p class="mt-1 text-sm text-muted-foreground">{paneCommunity.summary}</p>
                  <div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{paneCommunity.member_count} {paneCommunity.member_count === 1 ? 'member' : 'members'}</span>
                    <span>·</span>
                    <span>{(paneCommunity.importance * 100).toFixed(0)}% importance</span>
                  </div>
                  {#if paneCommunity.member_names.length > 0}
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      {#each paneCommunity.member_names as name}
                        <span class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{name}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if paneConnections.length > 0}
              <div>
                <p class="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Connections ({paneConnections.length})
                </p>
                <div class="flex flex-col gap-2">
                  {#each paneConnections as { other, label }}
                    <button
                      class="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
                      onclick={() => openEntity(other.id)}
                    >
                      <span class="size-2 shrink-0 rounded-full" style="background:{colorFor(other.type_label)}"></span>
                      <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{other.canonical_name}</span>
                      <span class="shrink-0 text-xs text-muted-foreground">{label.replace(/_/g, ' ')}</span>
                      <Icon icon="solar:arrow-right-linear" class="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
