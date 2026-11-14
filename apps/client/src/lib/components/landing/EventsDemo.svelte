<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Badge, icons } from '@facile/muse';
	import { Bar, Cursor, Stage, Stream, Window, cursorAt, grow, type Act } from '@facile/mise-en-scene';

	type Tone = 'accent' | 'info' | 'success' | 'warning';

	interface Arrival {
		provider: string;
		tone: Tone;
		type: string;
		title: string;
		meta: string;
	}

	const ARRIVALS: Arrival[] = [
		{
			provider: 'sablier',
			tone: 'warning',
			type: 'timer.stopped',
			title: 'Atelier Morel redesign, 1h 20min',
			meta: 'Sam · 09:38'
		},
		{
			provider: 'courrier',
			tone: 'success',
			type: 'message.received',
			title: 'Reply from Atelier Morel',
			meta: 'Léa Morel · 09:42'
		}
	];

	const SUMMARY = 'Léa approves the new homepage and asks to move the launch to Friday.';
	const SUMMARY_WORDS = SUMMARY.split(' ').length;

	const PAST: { provider: string; tone: Tone; title: number; meta: number }[] = [
		{ provider: 'capsule', tone: 'info', title: 58, meta: 30 },
		{ provider: 'antenne', tone: 'accent', title: 44, meta: 24 },
		{ provider: 'courrier', tone: 'success', title: 64, meta: 34 },
		{ provider: 'sablier', tone: 'warning', title: 50, meta: 28 }
	];

	const NAV = [
		{ label: 'Chat', icon: 'solar:chat-round-dots-linear', active: false },
		{ label: 'Events', icon: icons.bolt, active: true },
		{ label: 'Entities', icon: icons.usersGroup, active: false }
	];

	let shown = $state(0);
	let open = $state(false);
	let words = $state(0);
	let cursor = $state(cursorAt());
	let cards = $state<HTMLElement[]>([]);

	const arrivals = $derived(ARRIVALS.slice(0, shown).reverse());

	function reset() {
		shown = 0;
		open = false;
		words = 0;
		cursor.visible = false;
	}

	function poster() {
		shown = ARRIVALS.length;
		open = true;
		words = SUMMARY_WORDS;
	}

	async function script(act: Act) {
		cursor.x = 700;
		cursor.y = 470;
		await act.wait(800);
		shown = 1;
		await act.wait(1400);
		shown = 2;
		await act.wait(1200);
		await tick();
		cursor.visible = true;
		await act.move(cursor, act.point(cards[0], 0.62, 0.55));
		await act.click(cursor, () => (open = true));
		await tick();
		await act.move(cursor, { x: cursor.x + 70, y: cursor.y + 110 }, 400);
		await act.count(SUMMARY_WORDS, (v) => (words = v), 90);
		cursor.visible = false;
		await act.wait(2200);
		reset();
		await act.wait(600);
	}
</script>

{#snippet nav()}
	<div class="flex items-center gap-2 px-5 pt-3 pb-5 font-fc-title text-[15px] font-bold text-fc-fg">
		<iconify-icon icon="solar:eye-scan-bold-duotone" width="20" height="20"></iconify-icon>
		<span>Perception</span>
	</div>
	<div class="grid gap-1 px-3">
		{#each NAV as item (item.label)}
			<div
				class="flex h-[34px] items-center gap-2.5 rounded-fc-md px-2.5 text-[13px] {item.active
					? 'bg-fc-fg/5 text-fc-fg'
					: 'text-fc-fg-muted'}"
			>
				<iconify-icon icon={item.icon} width="16" height="16"></iconify-icon>
				<span>{item.label}</span>
			</div>
		{/each}
	</div>
{/snippet}

<Stage
	width={960}
	height={600}
	compact={{ below: 640, width: 358, height: 560 }}
	label="Perception's event timeline: new events arrive from Courrier and Sablier, and opening one shows its summary."
	{script}
	{reset}
	{poster}
>
	{#snippet children({ compact })}
		<Window
			style={compact
				? 'top:16px;left:16px;width:326px;height:488px'
				: 'top:24px;left:56px;width:848px;height:512px'}
			sidebar={compact ? undefined : nav}
		>
			<div class="ed-body" class:ed-compact={compact}>
				<div>
					<div class="font-fc-title text-fc-xl font-bold">Events</div>
					<div class="mt-1 text-[13px] text-fc-fg-muted">Activity flowing through Perception</div>
				</div>

				<ul class="ed-list">
					{#each arrivals as event, i (event.title)}
						<li in:grow out:fade={{ duration: 200 }}>
							<div class="ed-card" class:ed-open={i === 0 && open} bind:this={cards[i]}>
								<div class="flex items-center gap-2">
									<Badge tone={event.tone}>{event.provider}</Badge>
									{#if !compact}<span class="text-[12px] text-fc-fg-muted">{event.type}</span>{/if}
								</div>
								<div class="mt-2 text-[14px] font-bold">{event.title}</div>
								{#if i === 0 && open}
									<div class="mt-1 text-[13px] text-fc-fg-muted" in:grow>
										<Stream text={SUMMARY} count={words} />
									</div>
								{/if}
								<div class="mt-2 text-[12px] text-fc-fg-muted">{event.meta}</div>
							</div>
						</li>
					{/each}
					{#each compact ? PAST.slice(0, 3) : PAST as row, i (i)}
						<li>
							<div class="ed-card">
								<div class="flex items-center gap-2">
									<Badge tone={row.tone}>{row.provider}</Badge>
									<Bar w={90} h={6} />
								</div>
								<div class="mt-3"><Bar w="{row.title}%" /></div>
								<div class="mt-3"><Bar w="{row.meta}%" h={6} /></div>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</Window>
		<Cursor {cursor} />
	{/snippet}
</Stage>

<style>
	.ed-body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 20px;
		min-height: 0;
		overflow: hidden;
		padding: 20px 32px 24px;
		font-family: var(--font-fc-body);
		color: var(--color-fc-fg);
	}
	.ed-compact {
		gap: 16px;
		padding: 16px;
	}
	.ed-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ed-list > li {
		padding-bottom: 10px;
	}
	.ed-card {
		padding: 14px 16px;
		border-radius: var(--radius-fc-md);
		background: color-mix(in oklab, var(--color-fc-fg) 5%, transparent);
		transition: background-color 200ms ease;
	}
	.ed-open {
		background: color-mix(in oklab, var(--color-fc-fg) 9%, transparent);
	}
</style>
