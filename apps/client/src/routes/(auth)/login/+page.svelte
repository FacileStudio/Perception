<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Alert, Button, Divider, Field, Input } from '@facile/muse';
	import { auth } from '$lib/auth.svelte';
	import { OIDC_START_URL } from '$lib/backend';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let ready = $state(false);

	const ssoOnly = $derived(auth.ssoOnly);
	const oidcEnabled = $derived(auth.oidcEnabled);
	const showPasswordForm = $derived(!ssoOnly);

	/*
	 * A failed SSO callback comes back as a redirect to /login?error=<reason>,
	 * not as a status code, so without reading this a rejected sign-in is
	 * indistinguishable from arriving at the page normally.
	 *
	 * The reason is porte's own sentence, but it reaches us through a URL
	 * anybody can write, so it is capped: Svelte escapes it, which stops
	 * markup, and the cap stops the page being used to display a paragraph of
	 * someone else's choosing above a login form.
	 */
	const redirectError = $derived(page.url.searchParams.get('error')?.trim().slice(0, 200) ?? '');
	const notice = $derived(error || redirectError);

	onMount(async () => {
		if (!auth.loaded) await auth.load();
		ready = true;
	});

	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		loading = true;
		try {
			await auth.login({ email, password });
			goto('/', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Log in — Perception</title>
</svelte:head>

<div class="mb-8">
	<h1 class="font-fc-title text-fc-2xl font-bold tracking-tight text-fc-fg">Welcome back</h1>
	<p class="mt-1.5 text-fc-sm text-fc-fg-muted">
		{ssoOnly
			? 'Sign in with your Facile account to access Perception.'
			: 'Log in to your Perception account.'}
	</p>
</div>

{#if !ready}
	<div class="h-40"></div>
{:else}
	<!--
		Outside every SSO_ONLY branch on purpose. Under SSO_ONLY the password
		form is not rendered, and an alert nested inside it would swallow the
		one message a rejected federated login ever produces.
	-->
	{#if notice}
		<Alert tone="danger" class="mb-5">{notice}</Alert>
	{/if}

	{#if oidcEnabled}
		<Button
			type="button"
			size="lg"
			class="w-full rounded-fc-md"
			icon="solar:key-minimalistic-square-bold-duotone"
			onclick={() => (window.location.href = OIDC_START_URL)}
		>
			Sign in with Facile
		</Button>

		{#if !ssoOnly}
			<div class="my-5 flex items-center gap-3">
				<Divider class="my-0 flex-1" />
				<span class="text-fc-xs text-fc-fg-muted">or</span>
				<Divider class="my-0 flex-1" />
			</div>
		{/if}
	{/if}

	{#if showPasswordForm}
		<form onsubmit={handleLogin} class="flex flex-col gap-4">
			<Field label="Email">
				<Input
					id="email"
					name="email"
					type="email"
					bind:value={email}
					placeholder="you@facile.studio"
					required
					autocomplete="email"
					disabled={loading}
				/>
			</Field>

			<Field label="Password">
				<Input
					id="password"
					name="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					required
					autocomplete="current-password"
					disabled={loading}
				/>
			</Field>

			<Button type="submit" size="lg" class="w-full rounded-fc-md" disabled={loading}>
				{loading ? 'Logging in…' : 'Log in'}
			</Button>
		</form>
	{/if}

	{#if ssoOnly && !oidcEnabled}
		<Alert tone="danger">SSO is not configured. Contact your administrator.</Alert>
	{/if}

	{#if !ssoOnly}
		<p class="mt-6 text-center text-fc-sm text-fc-fg-muted">
			No account yet?
			<a href="/register" class="underline underline-offset-2 transition-colors hover:text-fc-fg">
				Create one
			</a>
		</p>
	{/if}
{/if}
