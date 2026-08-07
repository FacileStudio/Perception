<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Divider, icons } from '@facile/lib';
	import OptionCards from '$lib/components/OptionCards.svelte';
	import SettingsRow from '$lib/components/SettingsRow.svelte';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import { auth } from '$lib/auth.svelte';
	import { API_BASE } from '$lib/backend';
	import { theme, type ThemePreference } from '$lib/theme.svelte';

	const tabItems = [
		{ id: 'account', label: 'Account', icon: icons.userCircle },
		{ id: 'appearance', label: 'Appearance', icon: 'solar:pallete-2-linear' },
		{ id: 'about', label: 'About', icon: 'solar:info-circle-linear' }
	];

	const themeOptions = [
		{ value: 'system', label: 'System', icon: 'solar:monitor-linear' },
		{ value: 'light', label: 'Light', icon: 'solar:sun-linear' },
		{ value: 'dark', label: 'Dark', icon: 'solar:moon-linear' }
	];

	let active = $state('account');
	let preference = $state<string>(theme.preference);

	async function handleLogout() {
		await auth.logout();
		goto('/login', { replaceState: true });
	}

	function applyTheme(value: string) {
		preference = value;
		theme.set(value as ThemePreference);
	}
</script>

<svelte:head>
	<title>Settings — Perception</title>
</svelte:head>

<div class="px-4 py-6 md:px-8 md:py-8">
	<div class="mx-auto flex max-w-fc-md flex-col gap-4">
		<h1 class="font-heading text-fc-2xl font-semibold tracking-tight text-fc-fg">Settings</h1>
		<Tabs items={tabItems} bind:value={active} label="Settings sections" />
		<Divider class="my-0" />
	</div>

	<div class="mx-auto mt-6 flex max-w-fc-md flex-col gap-8">
		{#if active === 'account'}
			<SettingsSection title="Identity" description="Who this browser is signed in as.">
				<SettingsRow label="Name">
					<span class="text-fc-sm text-fc-fg-muted">{auth.user?.name || '—'}</span>
				</SettingsRow>
				<SettingsRow label="Email" description="Comes from your Perception account.">
					<span class="truncate font-fc-mono text-fc-sm text-fc-fg-muted">
						{auth.user?.email ?? ''}
					</span>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Session" description="Ends this session on this device.">
				<SettingsRow label="Log out">
					<Button variant="outline" onclick={handleLogout}>
						<iconify-icon
							icon={icons.logout}
							width="16"
							height="16"
							class="block shrink-0"
							aria-hidden="true"
						></iconify-icon>
						Log out
					</Button>
				</SettingsRow>
			</SettingsSection>
		{:else if active === 'appearance'}
			<SettingsSection title="Theme" description="Applied to this browser only.">
				<SettingsRow
					label="Colour scheme"
					description="System follows your operating system setting."
					stacked
				>
					<OptionCards
						options={themeOptions}
						value={preference}
						label="Colour scheme"
						onSelect={applyTheme}
					/>
				</SettingsRow>
			</SettingsSection>
		{:else}
			<SettingsSection
				title="Perception"
				description="The operational context brain for the Facile Suite. This build is the chassis only — ingest, events, entities and chat are not wired up yet."
			>
				<SettingsRow label="Interface">
					<span class="text-fc-sm text-fc-fg-muted">Perception web</span>
				</SettingsRow>
				<SettingsRow label="API">
					<span class="truncate font-fc-mono text-fc-sm text-fc-fg-muted">{API_BASE}</span>
				</SettingsRow>
				<SettingsRow label="Single sign-on">
					<span class="text-fc-sm text-fc-fg-muted">
						{auth.ssoOnly ? 'Required' : auth.oidcEnabled ? 'Available' : 'Disabled'}
					</span>
				</SettingsRow>
			</SettingsSection>
		{/if}
	</div>
</div>
