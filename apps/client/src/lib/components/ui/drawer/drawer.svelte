<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title = '',
    children,
    footer,
  }: {
    open: boolean;
    title?: string;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  let visible = $state(false);
  let animating = $state(false);

  $effect(() => {
    if (open) {
      visible = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          animating = true;
        });
      });
    } else {
      animating = false;
      setTimeout(() => {
        visible = false;
      }, 300);
    }
  });

  function handleBackdrop() {
    open = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if visible}
  <div class="fixed inset-0 z-50" role="dialog" aria-modal="true">
    <button
      class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 {animating ? 'opacity-100' : 'opacity-0'}"
      onclick={handleBackdrop}
      tabindex="-1"
      aria-label="Close drawer"
    ></button>

    <div
      class="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-zinc-200 bg-white shadow-2xl transition-transform duration-300 ease-out {animating ? 'translate-y-0' : 'translate-y-full'}"
    >
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-200"></div>

      {#if title}
        <div class="px-6 pb-2 pt-4">
          <h2 class="text-lg font-semibold text-zinc-950">{title}</h2>
        </div>
      {/if}

      <div class="flex-1 overflow-y-auto px-6 py-4">
        {@render children?.()}
      </div>

      {#if footer}
        <div class="border-t border-zinc-100 px-6 py-4">
          {@render footer?.()}
        </div>
      {/if}
    </div>
  </div>
{/if}
