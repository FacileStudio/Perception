<script lang="ts">
  import Icon from '@iconify/svelte';

  let {
    title,
    meta,
    onback,
    ondelete,
    disabled = false,
  }: {
    title: string;
    meta: string;
    onback: () => void;
    ondelete?: () => void;
    disabled?: boolean;
  } = $props();
</script>

<div class="border-b border-zinc-200/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
  <div class="relative flex items-center justify-center">
    <button
      type="button"
      class="absolute left-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-950"
      onclick={onback}
      {disabled}
      aria-label="Back to conversations"
    >
      <Icon icon="solar:alt-arrow-left-linear" class="size-4" />
    </button>
    <div class="min-w-0 px-14 text-center">
      <p class="truncate font-[Goga] text-lg tracking-tight text-zinc-950">{title}</p>
      <p class="truncate text-xs text-zinc-400">{meta}</p>
    </div>
    {#if ondelete}
      <button
        type="button"
        class="absolute right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
        onclick={ondelete}
        {disabled}
        aria-label="Delete conversation"
      >
        <Icon icon="solar:trash-bin-minimalistic-linear" class="size-4" />
      </button>
    {/if}
  </div>
</div>
