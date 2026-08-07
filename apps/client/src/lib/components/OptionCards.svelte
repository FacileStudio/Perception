<script lang="ts">
	type Option = { value: string; label: string; icon?: string };

	/*
	 * A local stand-in for muse's OptionCards, pending its release on the branch
	 * `@facile/lib` resolves to. A one-of-N preference is a radiogroup of icon
	 * cards with the selected card inverted — not a Select, which hides the
	 * choices behind a click.
	 */
	let {
		options = [],
		value = $bindable(''),
		label = 'Options',
		onSelect
	}: {
		options?: Option[];
		value?: string;
		label?: string;
		onSelect?: (value: string) => void;
	} = $props();

	function select(option: Option) {
		value = option.value;
		onSelect?.(option.value);
	}
</script>

<div role="radiogroup" aria-label={label} class="grid w-full grid-cols-3 gap-2">
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === option.value}
			onclick={() => select(option)}
			class="flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-fc-md px-3 py-3 text-fc-sm font-medium transition-colors {value ===
			option.value
				? 'bg-fc-accent text-fc-accent-fg'
				: 'bg-fc-surface text-fc-fg-muted hover:text-fc-fg'}"
		>
			{#if option.icon}
				<iconify-icon
					icon={option.icon}
					width="18"
					height="18"
					class="block shrink-0"
					aria-hidden="true"
				></iconify-icon>
			{/if}
			{option.label}
		</button>
	{/each}
</div>
