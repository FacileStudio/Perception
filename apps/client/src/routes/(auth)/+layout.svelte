<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import Logo from '$lib/components/Logo.svelte';

	let { children }: { children?: Snippet } = $props();

	onMount(async () => {
		if (!auth.loaded) await auth.load();
		if (auth.isAuthenticated) goto('/', { replaceState: true });
	});
</script>

<div class="flex min-h-[100dvh]">
	<div class="hidden flex-col bg-fc-accent px-12 py-10 lg:flex lg:w-1/2">
		<a href="/" class="mb-auto flex items-center text-fc-xl text-fc-accent-fg">
			<Logo size={26} wordmark />
		</a>

		<div class="mb-auto">
			<h2 class="font-heading text-fc-3xl leading-tight font-semibold text-fc-accent-fg">
				Everything that happened.<br />In one place.
			</h2>
			<p class="mt-4 max-w-xs text-fc-sm leading-relaxed text-fc-accent-fg/60">
				Perception is the operational context brain for the Facile Suite.
			</p>
		</div>

		<p class="text-fc-xs text-fc-accent-fg/40">
			&copy; {new Date().getFullYear()} Perception by Facile.
		</p>
	</div>

	<div
		class="flex w-full flex-col items-center justify-center bg-fc-page px-6 py-12 sm:px-8 lg:w-1/2"
	>
		<div class="w-full max-w-sm">
			<a href="/" class="mb-8 flex items-center text-fc-xl lg:hidden">
				<Logo size={26} wordmark />
			</a>
			{@render children?.()}
		</div>
	</div>
</div>
