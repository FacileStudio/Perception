<script lang="ts">
  type SliceData = { label: string; value: number; color?: string }
  let { data, size = 160 }: { data: SliceData[]; size?: number } = $props()

  const cx = $derived(size / 2)
  const cy = $derived(size / 2)
  const outerR = $derived(size * 0.42)
  const innerR = $derived(size * 0.26)

  const DEFAULT_COLORS = [
    '#6366f1', '#7c3aed', '#059669', '#2563eb',
    '#db2777', '#d97706', '#6b7280', '#94a3b8',
  ]

  type Slice = { path: string; color: string; label: string; value: number; pct: number }

  const total = $derived(data.reduce((s, d) => s + d.value, 0))

  const slices = $derived((): Slice[] => {
    if (total === 0) return []
    let angle = -Math.PI / 2
    return data.map((d, i) => {
      const sweep = (d.value / total) * Math.PI * 2
      const x1 = cx + outerR * Math.cos(angle)
      const y1 = cy + outerR * Math.sin(angle)
      const x2 = cx + outerR * Math.cos(angle + sweep)
      const y2 = cy + outerR * Math.sin(angle + sweep)
      const ix1 = cx + innerR * Math.cos(angle + sweep)
      const iy1 = cy + innerR * Math.sin(angle + sweep)
      const ix2 = cx + innerR * Math.cos(angle)
      const iy2 = cy + innerR * Math.sin(angle)
      const large = sweep > Math.PI ? 1 : 0
      const path = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`
      const color = d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
      const pct = Math.round((d.value / total) * 100)
      angle += sweep
      return { path, color, label: d.label, value: d.value, pct }
    })
  })
</script>

{#if data.length === 0 || total === 0}
  <p class="text-sm text-zinc-400 text-center py-6">No data</p>
{:else}
  <svg viewBox="0 0 {size} {size}" class="mx-auto w-full max-w-[200px]">
    {#each slices() as s}
      <path d={s.path} fill={s.color} />
    {/each}
    <text
      x={cx}
      y={cy - 7}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="20"
      font-weight="600"
      fill="#18181b"
    >{total}</text>
    <text
      x={cx}
      y={cy + 7}
      text-anchor="middle"
      dominant-baseline="middle"
      font-size="8"
      fill="#a1a1aa"
    >total</text>
  </svg>

  <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
    {#each slices() as s}
      <div class="flex items-center gap-1">
        <span class="inline-block w-2 h-2 rounded-full" style="background:{s.color}"></span>
        <span class="text-xs text-zinc-500">{s.label}</span>
        <span class="text-xs text-zinc-400 tabular-nums">({s.pct}%)</span>
      </div>
    {/each}
  </div>
{/if}
