<script lang="ts">
	import { Button, LandingFooter, LandingHeader, SignInWithFacile, TextElevate, icons } from '@facile/muse';
	import { auth } from '$lib/auth.svelte';
	import { OIDC_START_URL } from '$lib/backend';
	import EventsDemo from './EventsDemo.svelte';

	const ICON = 'solar:eye-scan-bold-duotone';

	const features = [
		{
			icon: 'solar:shield-check-linear',
			title: 'Signed ingest',
			body: 'Antenne delivers HMAC-signed events. Perception drops duplicates and replays.'
		},
		{
			icon: icons.history,
			title: 'One timeline',
			body: 'Every event from every app, with who did it and what it touched.'
		},
		{
			icon: 'solar:atom-linear',
			title: 'Embedded memory',
			body: 'Perception embeds each event in the background, ready for search by meaning.'
		},
		{
			icon: 'solar:document-text-linear',
			title: 'Refusals on record',
			body: 'Rejected deliveries land in an audit log that never stores source addresses.'
		}
	];

	const links = [{ href: '#features', label: 'Features' }];

	const columns = [
		{
			title: 'Product',
			links: [
				{ href: '#features', label: 'Features' },
				{ href: '/login', label: 'Sign in' }
			]
		}
	];
</script>

<svelte:head>
	<title>Perception · The context brain for operations</title>
</svelte:head>

{#snippet signIn()}
	{#if auth.oidcEnabled}
		<SignInWithFacile href={OIDC_START_URL} />
	{:else}
		<Button href="/login" size="lg">Sign in</Button>
	{/if}
{/snippet}

<div class="min-h-dvh overflow-x-clip bg-fc-page text-fc-fg">
	<LandingHeader appName="Perception" icon={ICON} {links} skipHref="#main" actions={signIn} />

	<main id="main">
		<section class="mx-auto max-w-5xl px-4 pt-20 pb-12 text-center sm:px-6 sm:pt-24">
			<h1 class="font-fc-title text-fc-3xl font-bold tracking-tight sm:text-5xl">
				<span class="block"><TextElevate text="Everything that happened." delay={0.1} /></span>
				<span class="block"><TextElevate text="In one place." delay={0.25} /></span>
			</h1>
			<p class="mx-auto mt-6 max-w-xl text-fc-md text-fc-fg-muted">
				Perception gathers events from across the Facile suite into one memory.
			</p>
			<div class="mt-10 flex justify-center">
				{@render signIn()}
			</div>
		</section>

		<section class="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
			<EventsDemo />
		</section>

		<section id="features" class="mx-auto max-w-5xl scroll-mt-20 px-4 py-12 sm:px-6">
			<ul class="grid gap-4 sm:grid-cols-2">
				{#each features as feature (feature.title)}
					<li class="rounded-fc-lg bg-fc-component p-6">
						<div class="mb-4 flex size-10 items-center justify-center rounded-fc-md bg-fc-surface">
							<iconify-icon icon={feature.icon} width="20" height="20" class="block shrink-0"></iconify-icon>
						</div>
						<h2 class="text-fc-lg font-bold">{feature.title}</h2>
						<p class="mt-1.5 text-fc-sm text-fc-fg-muted">{feature.body}</p>
					</li>
				{/each}
			</ul>
		</section>

		<section class="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
			<h2 class="font-fc-title text-fc-2xl font-bold tracking-tight">See what your suite did today.</h2>
			<div class="mt-8 flex justify-center">
				{@render signIn()}
			</div>
		</section>
	</main>

	<LandingFooter appName="Perception" icon={ICON} tagline="The context brain for Facile operations." {columns} />
</div>
