<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { GraphEntity } from '$lib/api';
  import Icon from '@iconify/svelte';

  type Connection = { other: GraphEntity; label: string };

  let {
    node,
    connections,
    onclose,
  }: {
    node: GraphEntity | null;
    connections: Connection[];
    onclose: () => void;
  } = $props();

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
</script>

{#if node}
  <div
    class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
    role="presentation"
    onclick={onclose}
    transition:fade={{ duration: 150 }}
  ></div>

  <div
    class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
    in:fly={{ x: 420, duration: 280, easing: cubicOut }}
    out:fly={{ x: 420, duration: 200, easing: cubicOut }}
  >
    <div class="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
      <div class="flex items-center gap-3">
        <span
          class="size-3 shrink-0 rounded-full"
          style="background:{colorFor(node.type_label)}"
        ></span>
        <div>
          <p class="text-sm font-semibold text-zinc-900">{node.canonical_name}</p>
          <p class="mt-0.5 font-mono text-xs text-zinc-400">{node.type_label}</p>
        </div>
      </div>
      <button
        onclick={onclose}
        class="mt-0.5 shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
        aria-label="Close"
      >
        <Icon icon="solar:close-circle-bold-duotone" class="size-4" />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl bg-zinc-50 px-4 py-3">
          <p class="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Events</p>
          <p class="mt-1 text-2xl font-semibold text-zinc-900">{node.event_count}</p>
        </div>
        <div class="rounded-xl bg-zinc-50 px-4 py-3">
          <p class="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Confidence</p>
          <p class="mt-1 text-2xl font-semibold text-zinc-900">
            {(node.confidence * 100).toFixed(0)}<span class="text-sm font-normal text-zinc-400"
              >%</span
            >
          </p>
        </div>
      </div>

      {#if connections.length > 0}
        <div>
          <p class="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Relations
            <span class="ml-1 font-mono normal-case text-zinc-300">({connections.length})</span>
          </p>
          <div class="space-y-1.5">
            {#each connections as { other, label }}
              <div
                class="flex items-center gap-3 rounded-xl border border-zinc-100 px-3.5 py-2.5"
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  style="background:{colorFor(other.type_label)}"
                ></span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-zinc-800">{other.canonical_name}</p>
                  <p class="font-mono text-[10px] text-zinc-400">{other.type_label}</p>
                </div>
                <span
                  class="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500"
                >
                  {label.replace(/_/g, ' ')}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Icon icon="solar:graph-linear" class="size-8 text-zinc-300" />
          <p class="text-sm text-zinc-400">No relations found for this entity.</p>
        </div>
      {/if}
    </div>
  </div>
{/if}
