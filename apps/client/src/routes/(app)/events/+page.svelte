<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, EmptyState, Spinner, Badge } from '@facile/muse';
	import { backend, type EventSummary } from '$lib/backend';

	let events = $state<EventSummary[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let nextCursor = $state<string | null>(null);

	async function loadEvents() {
		loading = true;
		error = null;
		try {
			const page = await backend.events({ limit: 50 });
			events = page.events;
			nextCursor = page.next_cursor ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load events';
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (!nextCursor) return;
		loading = true;
		try {
			const page = await backend.events({ limit: 50, cursor: nextCursor ?? undefined });
			events = [...events, ...page.events];
			nextCursor = page.next_cursor ?? null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load more events';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadEvents();
	});

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString('fr-FR', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getProviderBadgeVariant(provider: string): 'default' | 'primary' | 'secondary' | 'accent' {
		const variants: Record<string, 'default' | 'primary' | 'secondary' | 'accent'> = {
			antenne: 'accent',
			capsule: 'primary',
			courrier: 'secondary',
			sablier: 'default'
		};
		return variants[provider.toLowerCase()] ?? 'default';
	}
</script>

<svelte:head>
	<title>Events — Perception</title>
</svelte:head>

<div class="px-4 py-6 md:px-8 md:py-8">
	<header class="mb-6">
		<h1 class="font-heading text-fc-2xl font-semibold tracking-tight text-fc-fg">Events</h1>
		<p class="mt-1.5 text-fc-sm text-fc-fg-muted">
			Activity flowing through Perception
		</p>
	</header>

	{#if error}
		<div class="mb-4 rounded-fc-md border border-fc-error/30 bg-fc-error/10 p-4 text-fc-sm text-fc-error">
			{error}
		</div>
	{/if}

	{#if loading && events.length === 0}
		<div class="flex items-center justify-center py-12">
			<Spinner size="lg" />
		</div>
	{:else if events.length === 0}
		<EmptyState
			icon="solar:bolt-outline"
			title="No events yet"
			description="Events from your connected services will appear here once they start flowing in."
		/>
	{:else}
		<div class="space-y-3">
			{#each events as event (event.id)}
				<a
					href="/events/{event.id}"
					class="block rounded-fc-md border border-fc-border bg-fc-component p-4 transition-colors hover:border-fc-border/80 hover:bg-fc-surface"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<Badge variant={getProviderBadgeVariant(event.provider)}>
									{event.provider}
								</Badge>
								<span class="text-fc-xs text-fc-fg-muted">{event.event_type}</span>
								{#if event.entity_type}
									<span class="text-fc-xs text-fc-fg-muted">{event.entity_type}</span>
								{/if}
							</div>
							<h3 class="mt-2 font-medium text-fc-fg">{event.title || event.event_type}</h3>
							{#if event.summary}
								<p class="mt-1 text-fc-sm text-fc-fg-muted line-clamp-2">{event.summary}</p>
							{/if}
							<div class="mt-2 flex items-center gap-3 text-fc-xs text-fc-fg-muted">
								{#if event.actor_name}
									<span>{event.actor_name}</span>
								{/if}
								{#if event.entity_name}
									<span>{event.entity_name}</span>
								{/if}
								<span>{formatDate(event.occurred_at)}</span>
							</div>
						</div>
						{#if event.url}
							<iconify-icon
								icon="solar:external-link-outline"
								width="16"
								height="16"
								class="shrink-0 text-fc-fg-muted"
							></iconify-icon>
						{/if}
					</div>
				</a>
			{/each}
		</div>

		{#if nextCursor || events.length >= 50}
			<div class="mt-6 flex justify-center">
				<Button variant="outline" onclick={loadMore} disabled={loading}>
					{loading ? 'Loading...' : 'Load more'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
