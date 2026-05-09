<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { GraphEntity, EntityRelation } from '$lib/api';
  import { buildTitle } from '$lib/head';

  type SimNode = GraphEntity & { x: number; y: number; vx: number; vy: number; r: number };

  let loading = $state(true);
  let empty = $state(false);
  let entityCount = $state(0);
  let relationCount = $state(0);
  let refreshing = $state(false);
  let viewMode = $state<'entities' | 'relations'>('entities');
  let drawMode: 'entities' | 'relations' = 'entities';
  let relationLegend = $state<[string, string][]>([]);
  function setMode(m: 'entities' | 'relations') {
    viewMode = m;
    drawMode = m;
  }

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let tooltip: HTMLDivElement;
  let tooltipName: HTMLParagraphElement;
  let tooltipType: HTMLParagraphElement;
  let tooltipMeta: HTMLParagraphElement;

  let nodes: SimNode[] = [];
  let edges: EntityRelation[] = [];
  let hoveredNode: SimNode | null = null;
  let hoveredEdge: EntityRelation | null = null;
  let draggedNode: SimNode | null = null;
  let animId: number;
  let simAlpha = 1.0;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isPanning = false;
  let panStart = { x: 0, y: 0, px: 0, py: 0 };

  const RELATION_PALETTE = [
    '#6366f1', '#059669', '#db2777', '#d97706', '#2563eb', '#7c3aed',
    '#0891b2', '#65a30d', '#dc2626', '#9333ea', '#0d9488', '#ea580c',
  ];

  const relationColors = new Map<string, string>();

  const COLORS: [string, string][] = [
    ['deployment', '#6366f1'],
    ['service', '#6366f1'],
    ['monitor', '#6366f1'],
    ['contract', '#7c3aed'],
    ['document', '#7c3aed'],
    ['submission', '#7c3aed'],
    ['client', '#059669'],
    ['organization', '#059669'],
    ['company', '#059669'],
    ['account', '#059669'],
    ['task', '#2563eb'],
    ['work_item', '#2563eb'],
    ['issue', '#2563eb'],
    ['person', '#db2777'],
    ['contact', '#db2777'],
    ['signer', '#db2777'],
    ['invoice', '#d97706'],
    ['payment', '#d97706'],
    ['financial', '#d97706'],
  ];

  function colorFor(label: string): string {
    for (const [key, color] of COLORS) {
      if (label.includes(key)) return color;
    }
    return '#6b7280';
  }

  function relationColorFor(label: string): string {
    return relationColors.get(label) ?? '#6b7280';
  }

  function radiusFor(count: number): number {
    return Math.max(8, Math.min(40, 8 + Math.sqrt(count) * 4.2));
  }

  function cw(): number { return canvas?.offsetWidth ?? 800; }
  function ch(): number { return canvas?.offsetHeight ?? 600; }

  function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function reheat(target = 0.4) {
    simAlpha = Math.max(simAlpha, target);
  }

  function tick() {
    if (nodes.length === 0 || simAlpha <= 0.001) return;
    simAlpha = Math.max(0.001, simAlpha * 0.988);
    const alpha = simAlpha;
    const cx = cw() / 2;
    const cy = ch() / 2;

    // Many-body repulsion: 1/d falloff (smooth, no close-range spikes)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = (nodes[j].x - nodes[i].x) || 0.01;
        const dy = (nodes[j].y - nodes[i].y) || 0.01;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (d > 600) continue;
        const f = (1400 * alpha) / d;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Spring force for linked pairs (alpha-scaled — fades with simulation)
    const linkDist = 120;
    for (const edge of edges) {
      const s = nodes.find((n) => n.id === edge.from_id);
      const t = nodes.find((n) => n.id === edge.to_id);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = 0.07 * alpha * (d - linkDist);
      const fx = (f * dx) / d;
      const fy = (f * dy) / d;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Hard collision — direct position correction, no force bounce
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = (nodes[j].x - nodes[i].x) || 0.01;
        const dy = (nodes[j].y - nodes[i].y) || 0.01;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minD = nodes[i].r + nodes[j].r + 14;
        if (d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          if (nodes[i] !== draggedNode) { nodes[i].x -= nx * push; nodes[i].y -= ny * push; }
          if (nodes[j] !== draggedNode) { nodes[j].x += nx * push; nodes[j].y += ny * push; }
        }
      }
    }

    // Center gravity + velocity integration
    for (const node of nodes) {
      if (node === draggedNode) { node.vx = 0; node.vy = 0; continue; }
      node.vx += (cx - node.x) * 0.014 * alpha;
      node.vy += (cy - node.y) * 0.014 * alpha;
      node.vx *= 0.86;
      node.vy *= 0.86;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = cw();
    const H = ch();
    const mode = drawMode;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.scale(dpr, dpr);
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    for (const edge of edges) {
      const s = nodes.find((n) => n.id === edge.from_id);
      const t = nodes.find((n) => n.id === edge.to_id);
      if (!s || !t) continue;

      if (mode === 'relations') {
        const color = relationColorFor(edge.label);
        const isHE = hoveredEdge === edge;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = isHE ? color : color + 'aa';
        ctx.lineWidth = isHE ? 2 : 1.2;
        ctx.stroke();

        if (zoom > 0.45) {
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          const labelText = edge.label.replace(/_/g, ' ');
          ctx.font = '500 9px system-ui,sans-serif';
          const tw = ctx.measureText(labelText).width;
          const pad = 4;
          const ph = 13;

          ctx.fillStyle = isHE ? color + '22' : 'rgba(255,255,255,0.9)';
          fillRoundRect(ctx, mx - tw / 2 - pad, my - ph / 2, tw + pad * 2, ph, 3);

          ctx.fillStyle = isHE ? color : '#71717a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, mx, my);
        }
      } else {
        const active = hoveredNode?.id === s.id || hoveredNode?.id === t.id;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = active ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)';
        ctx.lineWidth = active ? 1.5 : 1;
        ctx.stroke();
      }
    }

    for (const node of nodes) {
      const isHovered = hoveredNode?.id === node.id;
      const isDragged = draggedNode?.id === node.id;
      const color = colorFor(node.type_label);

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isDragged) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const label = node.canonical_name.length > 12
        ? node.canonical_name.slice(0, 10) + '\u2026'
        : node.canonical_name;
      ctx.font = `${isHovered ? 500 : 400} 10px system-ui,sans-serif`;
      ctx.fillStyle = isHovered ? '#18181b' : '#52525b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, node.x, node.y + node.r + 4);
    }

    ctx.restore();
  }

  function loop() {
    tick();
    draw();
    animId = requestAnimationFrame(loop);
  }

  function screenToWorld(sx: number, sy: number) {
    const W = cw();
    const H = ch();
    return {
      x: (sx - W / 2 - panX) / zoom + W / 2,
      y: (sy - H / 2 - panY) / zoom + H / 2,
    };
  }

  function worldToScreen(wx: number, wy: number) {
    const W = cw();
    const H = ch();
    return {
      x: (wx - W / 2) * zoom + W / 2 + panX,
      y: (wy - H / 2) * zoom + H / 2 + panY,
    };
  }

  function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
  }

  function findHovered(sx: number, sy: number): SimNode | null {
    const { x, y } = screenToWorld(sx, sy);
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const node of nodes) {
      const d = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      if (d <= node.r + 4 && d < bestD) { best = node; bestD = d; }
    }
    return best;
  }

  function findHoveredEdge(sx: number, sy: number): EntityRelation | null {
    const { x, y } = screenToWorld(sx, sy);
    const threshold = 6 / zoom;
    let best: EntityRelation | null = null;
    let bestD = threshold;
    for (const edge of edges) {
      const s = nodes.find((n) => n.id === edge.from_id);
      const t = nodes.find((n) => n.id === edge.to_id);
      if (!s || !t) continue;
      const d = pointToSegmentDist(x, y, s.x, s.y, t.x, t.y);
      if (d < bestD) { best = edge; bestD = d; }
    }
    return best;
  }

  function showTooltip(node: SimNode, sx: number, sy: number) {
    if (!tooltip) return;
    tooltipName.textContent = node.canonical_name;
    tooltipType.textContent = node.type_label;
    tooltipMeta.textContent = `${node.event_count} ${node.event_count === 1 ? 'event' : 'events'} · ${(node.confidence * 100).toFixed(0)}% confidence`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${sx + 14}px`;
    tooltip.style.top = `${sy}px`;
  }

  function showEdgeTooltip(edge: EntityRelation) {
    if (!tooltip) return;
    const s = nodes.find((n) => n.id === edge.from_id);
    const t = nodes.find((n) => n.id === edge.to_id);
    if (!s || !t) return;
    const ms = worldToScreen((s.x + t.x) / 2, (s.y + t.y) / 2);
    tooltipName.textContent = `${s.canonical_name} → ${t.canonical_name}`;
    tooltipType.textContent = edge.label.replace(/_/g, ' ');
    tooltipMeta.textContent = `${(edge.confidence * 100).toFixed(0)}% confidence`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${ms.x + 14}px`;
    tooltip.style.top = `${ms.y}px`;
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  function resizeCanvas() {
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (draggedNode) {
      const { x, y } = screenToWorld(sx, sy);
      draggedNode.x = x;
      draggedNode.y = y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      canvas.style.cursor = 'grabbing';
      showTooltip(draggedNode, sx, sy);
      return;
    }

    const hit = findHovered(sx, sy);
    hoveredNode = hit;

    if (drawMode === 'relations' && !hit) {
      hoveredEdge = findHoveredEdge(sx, sy);
    } else {
      hoveredEdge = null;
    }

    canvas.style.cursor = hit ? 'grab' : hoveredEdge ? 'pointer' : isPanning ? 'grabbing' : 'grab';

    if (hit) showTooltip(hit, sx, sy);
    else if (hoveredEdge) showEdgeTooltip(hoveredEdge);
    else hideTooltip();

    if (isPanning) {
      panX = panStart.px + (e.clientX - panStart.x);
      panY = panStart.py + (e.clientY - panStart.y);
    }
  }

  function onMouseDown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = findHovered(sx, sy);
    if (hit) {
      draggedNode = hit;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      canvas.style.cursor = 'grabbing';
    } else {
      isPanning = true;
      canvas.style.cursor = 'grabbing';
      panStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    }
  }

  function onMouseUp() {
    if (draggedNode) reheat(0.4);
    draggedNode = null;
    isPanning = false;
    canvas.style.cursor = 'grab';
  }

  function onMouseLeave() {
    draggedNode = null;
    hoveredNode = null;
    hoveredEdge = null;
    isPanning = false;
    hideTooltip();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    zoom = Math.max(0.15, Math.min(5, zoom * (e.deltaY > 0 ? 0.9 : 1.11)));
  }

  function buildRelationColors() {
    const labels = [...new Set(edges.map((e) => e.label))].sort();
    labels.forEach((label, i) => {
      relationColors.set(label, RELATION_PALETTE[i % RELATION_PALETTE.length]);
    });
    relationLegend = labels.map((l) => [relationColors.get(l)!, l.replace(/_/g, ' ')] as [string, string]);
  }

  async function refreshGraph() {
    if (refreshing) return;
    refreshing = true;
    try {
      await api.admin.reprocessEntities();
      cancelAnimationFrame(animId);
      nodes = [];
      edges = [];
      simAlpha = 1.0;
      loading = true;
      await loadGraph();
    } finally {
      refreshing = false;
    }
  }

  async function loadGraph() {
    simAlpha = 1.0;
    try {
      const data = await api.entities.graph();
      const W = container?.clientWidth ?? 800;
      const H = container?.clientHeight ?? 600;
      nodes = data.entities.map((e) => ({
        ...e,
        x: W / 2 + (Math.random() - 0.5) * Math.min(W * 0.7, 460),
        y: H / 2 + (Math.random() - 0.5) * Math.min(H * 0.7, 360),
        vx: 0,
        vy: 0,
        r: radiusFor(e.event_count),
      }));
      edges = data.relations;
      entityCount = nodes.length;
      relationCount = edges.length;
      empty = nodes.length === 0;
      buildRelationColors();
    } catch {
      empty = true;
    }
    loading = false;
    loop();
  }

  onMount(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);
    loadGraph();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  });
</script>

<svelte:head>
  <title>{buildTitle('Graph')}</title>
</svelte:head>

<div class="flex h-full flex-col">
  <div class="shrink-0 border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm font-medium text-zinc-900">Entity Graph</span>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
        {entityCount} {entityCount === 1 ? 'entity' : 'entities'}
      </span>
      {#if relationCount > 0}
        <span class="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
          {relationCount} {relationCount === 1 ? 'relation' : 'relations'}
        </span>
      {/if}
<div class="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
        {#if viewMode === 'entities'}
          {#each [['#6366f1','deploy / service'],['#7c3aed','contract'],['#059669','client'],['#2563eb','task'],['#db2777','person'],['#d97706','financial']] as [color, label]}
            <span class="flex items-center gap-1.5">
              <span class="size-2 rounded-full" style="background:{color}"></span>
              {label}
            </span>
          {/each}
        {:else}
          {#each relationLegend as [color, label]}
            <span class="flex items-center gap-1.5">
              <span class="size-2 rounded-full" style="background:{color}"></span>
              {label}
            </span>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <div bind:this={container} class="relative min-h-0 flex-1 bg-[#f4f4f5]">
    <div class="absolute right-3 top-3 z-10 flex gap-0.5 rounded-xl border border-zinc-200/80 bg-white/80 p-0.5 shadow-sm backdrop-blur-md">
      <button
        class="rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {refreshing ? 'text-zinc-400' : 'text-zinc-500 hover:text-zinc-800'} disabled:cursor-not-allowed"
        onclick={refreshGraph}
        disabled={refreshing}
      >{refreshing ? 'Refreshing…' : 'Refresh graph'}</button>
    </div>

    <div class="absolute left-3 top-3 z-10 flex gap-0.5 rounded-xl border border-zinc-200/80 bg-white/80 p-0.5 shadow-sm backdrop-blur-md">
      <button
        class="rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'entities' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
        onclick={() => setMode('entities')}
      >Entities</button>
      <button
        class="rounded-[9px] px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'relations' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}"
        onclick={() => setMode('relations')}
      >Relations</button>
    </div>

    <canvas
      bind:this={canvas}
      class="absolute inset-0 block"
      style="width:100%;height:100%;cursor:grab"
      onmousemove={onMouseMove}
      onmousedown={onMouseDown}
      onmouseup={onMouseUp}
      onmouseleave={onMouseLeave}
      onwheel={onWheel}
    ></canvas>

    {#if loading}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span class="text-sm text-zinc-400">Loading graph…</span>
      </div>
    {:else if empty}
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span class="text-sm text-zinc-500">No entities resolved yet.</span>
        <span class="text-xs text-zinc-400">Entities appear here as events are ingested.</span>
      </div>
    {/if}

    <div
      bind:this={tooltip}
      class="pointer-events-none absolute z-10 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-lg"
      style="display:none;transform:translateY(-50%)"
    >
      <p bind:this={tooltipName} class="text-sm font-medium text-zinc-900"></p>
      <p bind:this={tooltipType} class="mt-0.5 font-mono text-[11px] text-zinc-400"></p>
      <p bind:this={tooltipMeta} class="mt-1.5 text-[11px] text-zinc-400"></p>
    </div>
  </div>
</div>
