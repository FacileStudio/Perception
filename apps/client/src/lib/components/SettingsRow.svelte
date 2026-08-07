<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * A local stand-in for muse's SettingsRow, pending its release on the branch
	 * `@facile/lib` resolves to. The rule lives on the row's own top edge so a
	 * section never has to count its children.
	 */
	let {
		label,
		description,
		stacked = false,
		children
	}: {
		label?: string;
		description?: string;
		stacked?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col gap-3 border-t border-fc-border py-4 first:border-t-0 first:pt-0 last:pb-0 {stacked
		? ''
		: 'sm:flex-row sm:items-center sm:justify-between sm:gap-6'}"
>
	{#if label || description}
		<div class="flex min-w-0 flex-col gap-1">
			{#if label}<span class="text-fc-sm font-medium text-fc-fg">{label}</span>{/if}
			{#if description}<span class="text-fc-xs text-fc-fg-muted">{description}</span>{/if}
		</div>
	{/if}
	{#if children}
		<div class="flex min-w-0 shrink-0 items-center gap-2 {stacked ? 'w-full' : ''}">
			{@render children()}
		</div>
	{/if}
</div>
