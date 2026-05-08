<script lang="ts">
  import type { ChatSource } from '$lib/api';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Separator } from '$lib/components/ui/separator';
  import Icon from '@iconify/svelte';

  let {
    sources,
    onclose,
  }: {
    sources: ChatSource[];
    onclose: () => void;
  } = $props();

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="fixed inset-x-4 bottom-24 top-24 z-20 flex flex-col rounded-[28px] border border-zinc-200/80 bg-white/95 shadow-[0_32px_80px_-48px_rgba(24,24,27,0.55)] xl:static xl:inset-auto xl:bottom-auto xl:top-auto xl:w-80 xl:rounded-none xl:border-0 xl:border-l xl:shadow-none">
  <div class="flex items-center justify-between px-4 py-3">
    <span class="inline-flex items-center gap-2 text-xs font-medium text-zinc-500">
      <Icon icon="solar:document-text-bold-duotone" class="size-4" />
      Sources
    </span>
    <button
      onclick={onclose}
      class="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
      aria-label="Close sources"
    >
      <Icon icon="solar:close-circle-bold-duotone" class="size-4" />
    </button>
  </div>
  <Separator />
  <ScrollArea class="flex-1 px-4 py-3">
    <div class="flex flex-col gap-3">
      {#each sources as src}
        <div class="flex flex-col gap-1 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3">
          <span class="text-xs font-medium text-zinc-900">{src.title}</span>
          <div class="flex items-center gap-2">
            <Badge variant="secondary">{src.provider_name}</Badge>
            <span class="text-xs text-zinc-400">{formatDate(src.occurred_at)}</span>
          </div>
          <span class="font-mono text-xs text-zinc-400">score: {src.score.toFixed(3)}</span>
        </div>
      {/each}
    </div>
  </ScrollArea>
</div>
