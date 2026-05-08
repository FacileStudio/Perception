<script lang="ts">
  let { class: className = '', children }: { class?: string; children?: any } = $props();
</script>

<div class="overflow-auto {className}">
  {@render children?.()}
</div>
