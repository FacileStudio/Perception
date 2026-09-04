<script lang="ts">
	import { page } from '$app/state';
	import { NavButton, icons } from '@facile/muse';
	import Logo from './Logo.svelte';

	let { email, name }: { email: string; name: string } = $props();

	/*
	 * Chat uses a raw Solar name because muse's icons map has no chat key. Add
	 * one there rather than growing a second vocabulary here.
	 *
	 * The rewrite ships the chassis first, so the sections that do not exist yet
	 * are rendered disabled rather than linking nowhere — a nav row that 404s is
	 * worse than one that admits it is not ready.
	 */
	const sections = [
		{ label: 'Chat', href: '/chat', icon: 'solar:chat-round-dots-linear', ready: false },
		{ label: 'Events', href: '/events', icon: icons.bolt, ready: true },
		{ label: 'Entities', href: '/entities', icon: icons.usersGroup, ready: false }
	];

	const settingsActive = $derived(page.url.pathname.startsWith('/settings'));
	const label = $derived(name || email || 'Account');
</script>

<aside
	class="sticky top-0 hidden h-[100dvh] w-55 shrink-0 flex-col justify-between gap-6 overflow-hidden bg-fc-component px-3 py-5 md:flex"
>
	<div class="flex flex-col gap-5">
		<a href="/" class="flex min-h-7 items-center px-2 pt-1 text-fc-xl">
			<Logo size={24} wordmark />
		</a>

		<nav class="flex flex-col gap-1">
			{#each sections as section (section.href)}
				{#if section.ready}
					<NavButton
						href={section.href}
						icon={section.icon}
						label={section.label}
						active={page.url.pathname.startsWith(section.href)}
					/>
				{:else}
					<NavButton
						icon={section.icon}
						label={section.label}
						disabled
						aria-disabled="true"
						class="cursor-not-allowed opacity-40 hover:bg-transparent hover:text-fc-fg-muted"
					>
						{#snippet right()}
							<span class="shrink-0 text-fc-xs opacity-70">Soon</span>
						{/snippet}
					</NavButton>
				{/if}
			{/each}
		</nav>
	</div>

	<a
		href="/settings"
		aria-current={settingsActive ? 'page' : undefined}
		aria-label="{label} — settings"
		class="flex min-h-11 w-full items-center gap-2.5 overflow-hidden rounded-fc-md px-2.5 py-2 text-fc-sm text-fc-fg transition-colors hover:bg-fc-surface {settingsActive
			? 'bg-fc-surface'
			: ''}"
	>
		<span
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-fc-pill bg-fc-accent text-fc-xs font-semibold text-fc-accent-fg"
		>
			{label.charAt(0).toUpperCase()}
		</span>
		<span class="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden">
			<span class="truncate">{label}</span>
			<iconify-icon
				icon={icons.settings}
				width="18"
				height="18"
				class="block shrink-0 text-fc-fg-muted"
				aria-hidden="true"
			></iconify-icon>
		</span>
	</a>
</aside>
