<script lang="ts">
  import Icon from '@iconify/svelte';

  let {
    title,
    meta,
    onback,
    disabled = false,
  }: {
    title: string;
    meta: string;
    onback: () => void;
    disabled?: boolean;
  } = $props();
</script>

<div class="border-b border-zinc-200/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
  <div class="mx-auto grid max-w-2xl grid-cols-[44px_1fr_44px] items-center gap-3">
    <button
      type="button"
      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-950"
      onclick={onback}
      {disabled}
      aria-label="Back to conversations"
    >
      <Icon icon="solar:alt-arrow-left-linear" class="size-4" />
    </button>
    <div class="min-w-0 text-center">
      <p class="truncate font-[Goga] text-lg tracking-tight text-zinc-950">{title}</p>
      <p class="truncate text-xs text-zinc-400">{meta}</p>
    </div>
    <div></div>
  </div>
</div>
