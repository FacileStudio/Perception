<script lang="ts">
  let { orientation = 'horizontal', class: className = '' }: { orientation?: 'horizontal' | 'vertical'; class?: string } = $props();
</script>

<div class="{orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full'} bg-zinc-200 {className}"></div>
