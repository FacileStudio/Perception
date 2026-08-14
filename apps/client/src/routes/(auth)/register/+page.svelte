<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Alert, Button, Field, Input } from '@facile/muse';
	import { auth } from '$lib/auth.svelte';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let ready = $state(false);

	const mismatch = $derived(confirmPassword.length > 0 && password !== confirmPassword);

	onMount(async () => {
		if (!auth.loaded) await auth.load();
		if (auth.ssoOnly) {
			goto('/login', { replaceState: true });
			return;
		}
		ready = true;
	});

	async function handleRegister(event: SubmitEvent) {
		event.preventDefault();
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;
		try {
			await auth.register({ email, password, name });
			goto('/', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Registration failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Create account — Perception</title>
</svelte:head>

{#if ready}
	<div class="mb-8">
		<h1 class="font-heading text-fc-2xl font-semibold tracking-tight text-fc-fg">Create account</h1>
		<p class="mt-1.5 text-fc-sm text-fc-fg-muted">Sign up to reach this Perception instance.</p>
	</div>

	<form onsubmit={handleRegister} class="flex flex-col gap-4">
		<Field label="Name">
			<Input
				id="name"
				name="name"
				type="text"
				bind:value={name}
				placeholder="Ada Lovelace"
				required
				autocomplete="name"
				disabled={loading}
			/>
		</Field>

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

		<Field label="Password" helper="At least 8 characters.">
			<Input
				id="password"
				name="password"
				type="password"
				bind:value={password}
				placeholder="••••••••"
				required
				minlength={8}
				autocomplete="new-password"
				disabled={loading}
			/>
		</Field>

		<Field label="Confirm password" error={mismatch ? 'Passwords do not match' : ''}>
			<Input
				id="confirm-password"
				name="confirm-password"
				type="password"
				bind:value={confirmPassword}
				placeholder="••••••••"
				required
				minlength={8}
				autocomplete="new-password"
				disabled={loading}
			/>
		</Field>

		{#if error}
			<Alert tone="danger">{error}</Alert>
		{/if}

		<Button type="submit" size="lg" class="w-full rounded-fc-md" disabled={loading || mismatch}>
			{loading ? 'Creating account…' : 'Create account'}
		</Button>
	</form>

	<p class="mt-6 text-center text-fc-sm text-fc-fg-muted">
		Already have an account?
		<a href="/login" class="underline underline-offset-2 transition-colors hover:text-fc-fg">
			Log in
		</a>
	</p>
{:else}
	<div class="h-40"></div>
{/if}
