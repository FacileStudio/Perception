<script lang="ts">
	type Item = { id: string; label: string; icon?: string };

	/*
	 * A local stand-in for muse's Tabs, pending its release on the branch
	 * `@facile/lib` resolves to. Selected tab is inverted, never tinted; the strip
	 * scrolls horizontally on narrow screens.
	 */
	let {
		items = [],
		value = $bindable(''),
		label = 'Sections'
	}: {
		items?: Item[];
		value?: string;
		label?: string;
	} = $props();
</script>

<div role="tablist" aria-label={label} class="flex gap-1 overflow-x-auto">
	{#each items as item (item.id)}
		<button
			type="button"
			role="tab"
			aria-selected={value === item.id}
			onclick={() => (value = item.id)}
			class="inline-flex h-11 shrink-0 items-center gap-2 rounded-fc-pill px-4 text-fc-sm font-medium transition-colors {value ===
			item.id
				? 'bg-fc-accent text-fc-accent-fg'
				: 'text-fc-fg-muted hover:bg-fc-surface hover:text-fc-fg'}"
		>
			{#if item.icon}
				<iconify-icon
					icon={item.icon}
					width="18"
					height="18"
					class="block shrink-0"
					aria-hidden="true"
				></iconify-icon>
			{/if}
			{item.label}
		</button>
	{/each}
</div>
