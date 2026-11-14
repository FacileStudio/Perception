<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Spinner, icons } from '@facile/muse';
	import { auth } from '$lib/auth.svelte';
	import Landing from '$lib/components/landing/Landing.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { children }: { children?: Snippet } = $props();

	const signedOut = $derived(auth.loaded && !auth.isAuthenticated);
	const landing = $derived(signedOut && page.url.pathname === '/');

	onMount(async () => {
		if (!auth.loaded) await auth.load();
	});

	$effect(() => {
		if (signedOut && !landing) goto('/login', { replaceState: true });
	});
</script>

{#if auth.isAuthenticated && auth.user}
	<div class="flex h-[100dvh] w-full overflow-hidden bg-fc-page">
		<Sidebar email={auth.user.email} name={auth.user.name} avatar={auth.user.avatar_url} />
		<div class="flex min-w-0 flex-1 flex-col">
			<header
				class="flex items-center justify-between gap-3 bg-fc-component px-4 py-3 text-fc-xl md:hidden"
			>
				<a href="/" class="flex items-center">
					<Logo size={22} wordmark />
				</a>
				<a
					href="/settings"
					aria-label="Settings"
					class="flex h-11 w-11 items-center justify-center rounded-fc-md text-fc-fg-muted transition-colors hover:bg-fc-surface hover:text-fc-fg"
				>
					<iconify-icon icon={icons.settings} width="20" height="20" class="block"></iconify-icon>
				</a>
			</header>
			<main class="min-w-0 flex-1 overflow-auto">
				{@render children?.()}
			</main>
		</div>
	</div>
{:else if landing}
	<Landing />
{:else}
	<div class="flex h-[100dvh] items-center justify-center">
		<Spinner size="lg" label="Loading" />
	</div>
{/if}
