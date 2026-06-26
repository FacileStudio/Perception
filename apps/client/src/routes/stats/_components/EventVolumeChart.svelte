<script lang="ts">
  import type { StatsSnapshot } from '$lib/api';

  let { snap }: { snap: StatsSnapshot } = $props();

  const days = $derived((snap.data.days ?? []) as Array<{ date: string; count: number }>);
  const max = $derived(Math.max(...days.map((d) => d.count), 1));
  const todayKey = new Date().toISOString().slice(0, 10);

  function barHeight(count: number): number {
    if (count === 0) return 2;
    return Math.max(4, Math.round((count / max) * 52));
  }

  function shortLabel(date: string): string {
    const d = new Date(date + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="flex items-center justify-between mb-3">
  <span class="text-sm font-semibold text-foreground">Events per day</span>
  <span class="text-xs text-muted-foreground">30-day rolling window</span>
</div>

<div class="flex items-end gap-[3px] h-14">
  {#each days as day}
    <div
      class="group relative flex-1 flex flex-col items-center justify-end h-full"
    >
      <div
        class="w-full rounded-t-[2px] transition-colors {day.date === todayKey
          ? 'bg-primary'
          : day.count === 0
            ? 'bg-muted'
            : 'bg-muted-foreground/30 group-hover:bg-muted-foreground/50'}"
        style="height:{barHeight(day.count)}px"
      ></div>

      <div class="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex flex-col items-center gap-0.5 whitespace-nowrap rounded-xl border border-border bg-white px-2.5 py-1.5">
        <span class="text-[11px] font-medium text-foreground">{day.count} {day.count === 1 ? 'event' : 'events'}</span>
        <span class="text-[10px] text-muted-foreground">{shortLabel(day.date)}</span>
      </div>
    </div>
  {/each}
</div>

<div class="mt-1.5 flex justify-end">
  <span class="text-[10px] text-muted-foreground">today ↑</span>
</div>
