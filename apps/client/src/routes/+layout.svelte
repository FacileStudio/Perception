<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { Toaster } from 'svelte-sonner';
	import { theme } from '$lib/theme.svelte';

	let { children }: { children?: Snippet } = $props();

	theme.restore();
</script>

<Toaster position="bottom-right" theme={theme.resolved} />
{@render children?.()}
