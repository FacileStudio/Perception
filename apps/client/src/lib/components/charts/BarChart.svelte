<script lang="ts">
  type BarData = { label: string; current: number; previous?: number; color?: string }
  let { data, height = 180 }: { data: BarData[]; height?: number } = $props()

  const PALETTE = ['#6366f1','#7c3aed','#059669','#2563eb','#db2777','#d97706','#6b7280','#94a3b8']

  const PAD = { top: 16, right: 8, bottom: 36, left: 36 }
  const chartW = 500 - PAD.left - PAD.right
  const chartH = $derived(height - PAD.top - PAD.bottom)

  const hasPrev = $derived(data.some(d => d.previous !== undefined && d.previous > 0))
  const maxVal = $derived(Math.max(...data.flatMap(d => [d.current, d.previous ?? 0]), 1))

  const barGroupW = $derived(chartW / Math.max(data.length, 1))
  const barW = $derived(hasPrev ? barGroupW * 0.35 : barGroupW * 0.55)
  const barGap = 2
  const offsetInGroup = $derived(
    (barGroupW - (hasPrev ? barW * 2 + barGap : barW)) / 2
  )

  const gridLines = [0, 0.33, 0.66, 1]

  function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + '…' : s
  }
</script>

<svg viewBox="0 0 500 {height}" class="w-full">
  {#if data.length === 0}
    <text
      x="250"
      y={height / 2}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="12"
      fill="#a1a1aa"
    >No data</text>
  {:else}
    {#each gridLines as frac}
      {@const y = PAD.top + chartH - frac * chartH}
      {@const val = Math.round(frac * maxVal)}
      <line
        x1={PAD.left}
        y1={y}
        x2={500 - PAD.right}
        y2={y}
        stroke="#e4e4e7"
        stroke-width="1"
      />
      <text
        x={PAD.left - 4}
        y={y}
        text-anchor="end"
        dominant-baseline="middle"
        font-size="9"
        fill="#a1a1aa"
      >{val}</text>
    {/each}

    {#each data as d, i}
      {@const x = PAD.left + i * barGroupW + offsetInGroup}
      {@const barH = (d.current / maxVal) * chartH}
      {@const barY = PAD.top + chartH - barH}
      {@const groupCenterX = PAD.left + i * barGroupW + barGroupW / 2}

      <rect
        x={x}
        y={barY}
        width={barW}
        height={barH}
        fill={d.color ?? PALETTE[i % PALETTE.length]}
        rx="3"
      />

      {#if hasPrev && d.previous !== undefined}
        {@const prevH = (d.previous / maxVal) * chartH}
        {@const prevY = PAD.top + chartH - prevH}
        <rect
          x={x + barW + barGap}
          y={prevY}
          width={barW}
          height={prevH}
          fill="#d4d4d8"
          rx="3"
        />
      {/if}

      <text
        x={groupCenterX}
        y={height - 8}
        text-anchor="middle"
        font-size="9"
        fill="#71717a"
      >{truncate(d.label, 10)}</text>
    {/each}

    {#if hasPrev}
      {@const legendX = 500 - PAD.right - 8}
      <rect x={legendX - 60} y={PAD.top} width="8" height="8" fill={data[0]?.color ?? PALETTE[0]} rx="2" />
      <text x={legendX - 60 + 10} y={PAD.top + 4} dominant-baseline="middle" font-size="9" fill="#71717a">current</text>
      <rect x={legendX - 60} y={PAD.top + 12} width="8" height="8" fill="#d4d4d8" rx="2" />
      <text x={legendX - 60 + 10} y={PAD.top + 16} dominant-baseline="middle" font-size="9" fill="#71717a">previous</text>
    {/if}
  {/if}
</svg>
