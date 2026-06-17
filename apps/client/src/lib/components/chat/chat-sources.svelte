<script lang="ts">
  import type { ChatSource, ChatMessage } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Separator } from '$lib/components/ui/separator';
  import Icon from '@iconify/svelte';

  let {
    sources,
    message = null,
    onclose,
  }: {
    sources: ChatSource[];
    message?: ChatMessage | null;
    onclose: () => void;
  } = $props();

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="fixed inset-x-4 bottom-24 top-24 z-20 flex flex-col rounded-[28px] border border-border bg-background/95 shadow-[0_32px_80px_-48px_rgba(24,24,27,0.55)] xl:static xl:inset-auto xl:bottom-auto xl:top-auto xl:w-80 xl:rounded-none xl:border-0 xl:border-l xl:shadow-none">
  <div class="flex items-center justify-between px-4 py-3">
    <span class="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <Icon icon="solar:document-text-linear" class="size-4" />
      Sources
    </span>
    <button
      onclick={onclose}
      class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Close sources"
    >
      <Icon icon="solar:close-circle-linear" class="size-4" />
    </button>
  </div>
  <Separator />
  <ScrollArea class="flex-1 px-4 py-3">
    <div class="flex flex-col gap-3">
      {#if message?.sql_query}
        <div class="flex flex-col gap-1.5 rounded-2xl border border-indigo-200/80 bg-indigo-50/50 p-3">
          <div class="flex items-center gap-2">
            <Icon icon="solar:database-linear" class="size-4 text-indigo-500" />
            <span class="text-xs font-medium text-indigo-700">Generated SQL query</span>
          </div>
          <pre class="overflow-x-auto rounded-lg bg-zinc-950 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-zinc-300">{message.sql_query.query}</pre>
          <span class="font-mono text-[11px] text-indigo-400">
            {message.sql_query.row_count} {message.sql_query.row_count === 1 ? 'row' : 'rows'} · {message.sql_query.columns.length} {message.sql_query.columns.length === 1 ? 'column' : 'columns'}
          </span>
        </div>
      {/if}

      {#if message?.community_summaries && message.community_summaries.length > 0}
        {#each message.community_summaries as cs}
          <div class="flex flex-col gap-1.5 rounded-2xl border border-violet-200/80 bg-violet-50/50 p-3">
            <div class="flex items-center gap-2">
              <Icon icon="solar:graph-linear" class="size-4 text-violet-500" />
              <span class="text-xs font-medium text-violet-700">{cs.title}</span>
            </div>
            <p class="text-xs leading-relaxed text-violet-600">{cs.summary}</p>
            <div class="flex flex-wrap gap-1">
              {#each cs.matched_entities as name}
                <Badge variant="outline" class="rounded-full border-violet-200 text-[10px] text-violet-600">
                  {name}
                </Badge>
              {/each}
            </div>
            <span class="font-mono text-[10px] text-violet-400">{cs.member_count} entities in cluster</span>
          </div>
        {/each}
      {/if}

      {#if message?.narratives && message.narratives.length > 0}
        {#each message.narratives as n}
          <div class="flex flex-col gap-1.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3">
            <div class="flex items-center gap-2">
              <Icon icon="solar:document-text-linear" class="size-4 text-emerald-500" />
              <span class="text-xs font-medium text-emerald-700">{n.entity_name}</span>
            </div>
            <p class="text-xs leading-relaxed text-emerald-600">{n.narrative}</p>
            <span class="font-mono text-[10px] text-emerald-400">{n.event_count} events analyzed</span>
          </div>
        {/each}
      {/if}

      {#if message?.sub_queries && message.sub_queries.length > 0}
        <div class="flex flex-col gap-1.5 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3">
          <div class="flex items-center gap-2">
            <Icon icon="solar:branching-paths-up-linear" class="size-4 text-amber-500" />
            <span class="text-xs font-medium text-amber-700">Composite query</span>
          </div>
          <ol class="ml-4 list-decimal text-xs leading-relaxed text-amber-600">
            {#each message.sub_queries as sq}
              <li>{sq}</li>
            {/each}
          </ol>
        </div>
      {/if}

      {#if message?.memory_episodes && message.memory_episodes.length > 0}
        {#each message.memory_episodes as ep}
          <div class="flex flex-col gap-1.5 rounded-2xl border border-sky-200/80 bg-sky-50/50 p-3">
            <div class="flex items-center gap-2">
              <Icon icon="solar:brain-linear" class="size-4 text-sky-500" />
              <span class="text-xs font-medium text-sky-700">Memory episode</span>
            </div>
            <p class="text-xs leading-relaxed text-sky-600">{ep.summary}</p>
            {#if ep.entities.length > 0}
              <div class="flex flex-wrap gap-1">
                {#each ep.entities as entity}
                  <Badge variant="outline" class="rounded-full border-sky-200 text-[10px] text-sky-600">
                    {entity}
                  </Badge>
                {/each}
              </div>
            {/if}
            <span class="font-mono text-[10px] text-sky-400">{ep.occurred}</span>
          </div>
        {/each}
      {/if}

      {#if message?.resources && message.resources.length > 0}
        {#each message.resources as r}
          <div class="flex flex-col gap-1.5 rounded-2xl border border-orange-200/80 bg-orange-50/50 p-3">
            <div class="flex items-center gap-2">
              <Icon icon="solar:file-text-linear" class="size-4 text-orange-500" />
              <span class="text-xs font-medium text-orange-700">{r.title}</span>
            </div>
            <p class="text-xs leading-relaxed text-orange-600">{r.content}</p>
            <span class="font-mono text-[10px] text-orange-400">chunk {r.chunk_index}</span>
          </div>
        {/each}
      {/if}

      {#if message?.counterfactual}
        <div class="flex flex-col gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/50 p-3">
          <div class="flex items-center gap-2">
            <Icon icon="solar:flask-linear" class="size-4 text-rose-500" />
            <span class="text-xs font-medium text-rose-700">Counterfactual simulation</span>
          </div>
          <p class="text-xs leading-relaxed text-rose-600">{message.counterfactual.scenario}</p>
          <div class="flex items-center gap-2">
            <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium {message.counterfactual.confidence === 'high' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : message.counterfactual.confidence === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}">
              {message.counterfactual.confidence} confidence
            </span>
          </div>
          {#if message.counterfactual.causal_chain.length > 0}
            <div class="mt-1">
              <span class="text-[10px] font-medium text-rose-500">Causal chain</span>
              <div class="mt-1 flex flex-col gap-1">
                {#each message.counterfactual.causal_chain as step}
                  <div class="flex items-center gap-1 text-[10px] text-rose-600">
                    <span class="font-medium">{step.cause}</span>
                    <Icon icon="solar:arrow-right-linear" class="size-3 shrink-0" />
                    <span class="font-medium">{step.effect}</span>
                    <span class="text-rose-400">({step.lag_days}d lag)</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          {#if message.counterfactual.affected_entities.length > 0}
            <div class="mt-1">
              <span class="text-[10px] font-medium text-rose-500">Affected entities</span>
              <div class="mt-1 flex flex-wrap gap-1">
                {#each message.counterfactual.affected_entities as entity}
                  <span class="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-0.5 text-[10px] font-medium {entity.direction === 'increase' ? 'text-emerald-700 bg-emerald-50' : entity.direction === 'decrease' ? 'text-red-600 bg-red-50' : 'text-zinc-600 bg-zinc-50'}">
                    {entity.direction === 'increase' ? '↑' : entity.direction === 'decrease' ? '↓' : '—'} {entity.series}
                    <span class="text-[9px] opacity-60">{Math.round(entity.probability * 100)}%</span>
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          {#if message.counterfactual.distribution}
            <div class="mt-1">
              <span class="text-[10px] font-medium text-rose-500">Monte Carlo distribution</span>
              <div class="mt-1 grid grid-cols-5 gap-1 text-center">
                {#each [['p10', message.counterfactual.distribution.p10], ['p25', message.counterfactual.distribution.p25], ['p50', message.counterfactual.distribution.p50], ['p75', message.counterfactual.distribution.p75], ['p90', message.counterfactual.distribution.p90]] as [label, val]}
                  <div class="flex flex-col rounded-lg bg-rose-100/60 px-1.5 py-1">
                    <span class="text-[9px] text-rose-400">{label}</span>
                    <span class="font-mono text-[10px] font-medium text-rose-700">{typeof val === 'number' ? val.toFixed(1) : val}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#each sources as src}
        <div class="flex flex-col gap-1 rounded-2xl border border-border bg-muted/70 p-3">
          <span class="text-xs font-medium text-foreground">{src.title}</span>
          <div class="flex items-center gap-2">
            <Badge variant="secondary">{src.provider_name}</Badge>
            <span class="text-xs text-muted-foreground">{formatDate(src.occurred_at)}</span>
          </div>
          <span class="font-mono text-xs text-muted-foreground">score: {src.score.toFixed(3)}</span>
        </div>
      {/each}
    </div>
  </ScrollArea>
</div>
