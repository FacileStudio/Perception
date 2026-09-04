<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Button, Spinner } from '@facile/muse';
	import { backend, type EventSummary } from '$lib/backend';
	import { page } from '$app/state';

	let event = $state<EventSummary | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let eventId = $derived(page.params.id);

	async function loadEvent() {
		loading = true;
		error = null;
		try {
			const data = await fetch(`/api/events/${eventId}`);
			if (!data.ok) {
				throw new Error(`Failed to load event: ${data.status}`);
			}
			const eventData = await data.json();
			event = eventData as EventSummary;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load event';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadEvent();
	});

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString('fr-FR', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getProviderBadgeVariant(provider: string) {
		const variants: Record<string, string> = {
			antenne: 'accent',
			capsule: 'primary',
			courrier: 'secondary',
			sablier: 'default'
		};
		return variants[provider.toLowerCase()] ?? 'default';
	}
</script>

<svelte:head>
	<title>Event {eventId} — Perception</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center py-12">
		<Spinner size="lg" />
	</div>
{:else if error}
	<div class="p-8">
		<div class="rounded-fc-md border border-fc-error/30 bg-fc-error/10 p-4 text-fc-sm text-fc-error">
			{error}
		</div>
	</div>
{:else if event}
	<div class="px-4 py-6 md:px-8 md:py-8">
		<div class="mb-6">
			<Button variant="ghost" href="/events" class="mb-4">
				← Back to events
			</Button>
			<div class="flex items-center gap-2">
				<span class="badge badge-soft" data-variant={getProviderBadgeVariant(event.provider)}>
					{event.provider}
				</span>
				<span class="text-fc-xs text-fc-fg-muted">{event.event_type}</span>
				{#if event.entity_type}
					<span class="text-fc-xs text-fc-fg-muted">{event.entity_type}</span>
				{/if}
			</div>
			<h1 class="mt-2 font-heading text-fc-xl font-semibold text-fc-fg">
				{event.title || event.event_type}
			</h1>
			<div class="mt-2 flex items-center gap-3 text-fc-sm text-fc-fg-muted">
				{#if event.actor_name}
					<span>by {event.actor_name}</span>
				{/if}
				{#if event.entity_name}
					<span>{event.entity_name}</span>
				{/if}
				<span>{formatDate(event.occurred_at)}</span>
			</div>
		</div>

		{#if event.summary}
			<div class="prose prose-sm max-w-none text-fc-fg">
				<p>{event.summary}</p>
			</div>
		{/if}

		{#if event.url}
			<div class="mt-6">
				<a href={event.url} class="text-fc-accent hover:underline">
					View source
				</a>
			</div>
		{/if}
	</div>
{/if}
