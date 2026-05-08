<script lang="ts">
  let { class: className = '', children }: { class?: string; children?: any } = $props();
</script>

<div class="rounded-lg border border-zinc-200 bg-white {className}">
  {@render children?.()}
</div>
