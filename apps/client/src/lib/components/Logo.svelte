<script lang="ts">
	/**
	 * Perception brand mark. `size` drives the glyph; the wordmark inherits its
	 * font size from the parent, so callers set it with a text-* class.
	 */
	let {
		size = 24,
		wordmark = false,
		class: className = ''
	}: { size?: number; wordmark?: boolean; class?: string } = $props();
</script>

<span class="inline-flex items-center gap-2.5 {className}">
	<iconify-icon
		icon="solar:eye-scan-bold-duotone"
		width={size}
		height={size}
		class="block shrink-0"
		aria-hidden="true"
	></iconify-icon>
	{#if wordmark}
		<span class="font-fc-title font-bold tracking-tight">Perception</span>
	{/if}
</span>
