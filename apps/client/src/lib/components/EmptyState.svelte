<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		icon,
		children
	}: {
		title: string;
		description?: string;
		icon?: string;
		children?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col items-center rounded-fc-lg border border-dashed border-fc-border px-6 py-12 text-center"
>
	{#if icon}
		<iconify-icon
			{icon}
			width="28"
			height="28"
			class="mb-4 block text-fc-fg-muted"
			aria-hidden="true"
		></iconify-icon>
	{/if}
	<p class="text-fc-lg font-semibold text-fc-fg">{title}</p>
	{#if description}
		<p class="mt-2 max-w-sm text-fc-sm text-fc-fg-muted">{description}</p>
	{/if}
	{#if children}
		<div class="mt-6 flex flex-wrap justify-center gap-2">
			{@render children()}
		</div>
	{/if}
</div>
