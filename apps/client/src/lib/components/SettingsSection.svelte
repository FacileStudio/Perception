<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Card } from '@facile/lib';

	/*
	 * A local stand-in for muse's SettingsSection, which exists in the library
	 * source but not yet on the branch `@facile/lib` resolves to. Same markup and
	 * tokens, so switching to the import is a one-line change once muse ships it.
	 */
	let {
		title,
		description,
		actions,
		bare = false,
		children
	}: {
		title?: string;
		description?: string;
		actions?: Snippet;
		bare?: boolean;
		children?: Snippet;
	} = $props();
</script>

<section class="flex flex-col gap-4">
	{#if title || description || actions}
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex min-w-0 flex-col gap-1">
				{#if title}<h2 class="text-fc-lg font-semibold text-fc-fg">{title}</h2>{/if}
				{#if description}<p class="text-fc-sm text-fc-fg-muted">{description}</p>{/if}
			</div>
			{#if actions}
				<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
			{/if}
		</div>
	{/if}

	{#if children}
		{#if bare}
			<div class="flex flex-col gap-4">{@render children()}</div>
		{:else}
			<Card class="flex flex-col gap-4">{@render children()}</Card>
		{/if}
	{/if}
</section>
