<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '@facile/lib';
	import EmptyState from '$lib/components/EmptyState.svelte';
</script>

<svelte:head>
	<title>Perception</title>
</svelte:head>

<div class="px-4 py-6 md:px-8 md:py-8">
	<header class="mb-6">
		<h1 class="font-heading text-fc-2xl font-semibold tracking-tight text-fc-fg">Overview</h1>
		<p class="mt-1.5 text-fc-sm text-fc-fg-muted">
			Perception is being rebuilt on Go. Only sign-in works today.
		</p>
	</header>

	<EmptyState
		icon="solar:eye-scan-linear"
		title="Nothing to look at yet"
		description="Ingest, events, entities and chat are not part of this build. When they land, they will show up here."
	>
		<Button variant="outline" onclick={() => goto('/settings')}>Open settings</Button>
	</EmptyState>
</div>
