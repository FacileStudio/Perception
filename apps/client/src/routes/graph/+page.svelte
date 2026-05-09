<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import type { GraphEntity, EntityRelation } from '$lib/api';
  import { buildTitle } from '$lib/head';

  type SimNode = GraphEntity & { x: number; y: number; vx: number; vy: number; r: number };

  let container: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let loading = $state(true);
  let entityCount = $state(0);
  let relationCount = $state(0);
  let tooltipNode: SimNode | null = $state(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let isPanning = $state(false);

  let nodes: SimNode[] = [];
  let edges: EntityRelation[] = [];
  let hoveredNode: SimNode | null = null;
  let animId: number;
  let tickCount = 0;
  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let panStart = { x: 0, y: 0, px: 0, py: 0 };

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

  function radiusFor(count: number): number {
    return Math.max(10, Math.min(36, 10 + Math.sqrt(count) * 4.2));
  }

  function cw(): number { return canvas?.offsetWidth ?? 800; }
  function ch(): number { return canvas?.offsetHeight ?? 600; }

  function tick() {
    if (nodes.length === 0) return;
    const cx = cw() / 2;
    const cy = ch() / 2;
    const alpha = Math.max(0.02, 1 - tickCount / 280);
    const repulsion = 3000 * alpha;
    const gravity = 0.006 * alpha;
    const damping = 0.78;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = (nodes[j].x - nodes[i].x) || 0.01;
        const dy = (nodes[j].y - nodes[i].y) || 0.01;
        const d2 = Math.max(1, dx * dx + dy * dy);
        const d = Math.sqrt(d2);
        const minD = nodes[i].r + nodes[j].r + 14;
        const f = d < minD ? (repulsion * 3) / d2 : repulsion / d2;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    for (const edge of edges) {
      const s = nodes.find((n) => n.id === edge.from_id);
      const t = nodes.find((n) => n.id === edge.to_id);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = 0.04 * (d - 160);
      s.vx += (f * dx) / d;
      s.vy += (f * dy) / d;
      t.vx -= (f * dx) / d;
      t.vy -= (f * dy) / d;
    }

    for (const node of nodes) {
      node.vx += (cx - node.x) * gravity;
      node.vy += (cy - node.y) * gravity;
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }

    tickCount++;
  }

  function draw() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = cw();
    const H = ch();

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
      const active = hoveredNode?.id === s.id || hoveredNode?.id === t.id;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = active ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.stroke();
    }

    for (const node of nodes) {
      const isHovered = hoveredNode?.id === node.id;
      const color = colorFor(node.type_label);

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? color + 'dd' : color + 'cc';
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (node.r >= 14 || isHovered) {
        const fontSize = Math.min(11, node.r * 0.66);
        ctx.font = `500 ${fontSize}px system-ui,sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = node.canonical_name.length > 16
          ? node.canonical_name.slice(0, 14) + '\u2026'
          : node.canonical_name;
        ctx.fillText(label, node.x, node.y);
      }
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

  function resizeCanvas() {
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function onMouseMove(e: MouseEvent) {
    const rect = canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    hoveredNode = findHovered(sx, sy);
    tooltipNode = hoveredNode;
    tooltipX = sx + 14;
    tooltipY = sy;
    if (isPanning) {
      panX = panStart.px + (e.clientX - panStart.x);
      panY = panStart.py + (e.clientY - panStart.y);
    }
  }

  function onMouseDown(e: MouseEvent) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  }

  function onMouseUp() { isPanning = false; }
  function onMouseLeave() { hoveredNode = null; tooltipNode = null; isPanning = false; }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    zoom = Math.max(0.15, Math.min(5, zoom * (e.deltaY > 0 ? 0.9 : 1.11)));
  }

  async function loadGraph() {
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
    } catch {}
    loading = false;
    loop();
  }

  onMount(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (container) ro.observe(container);
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
        {#each [['#6366f1','deploy / service'],['#7c3aed','contract'],['#059669','client'],['#2563eb','task'],['#db2777','person'],['#d97706','financial']] as [color, label]}
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full" style="background:{color}"></span>
            {label}
          </span>
        {/each}
      </div>
    </div>
  </div>

  <div bind:this={container} class="relative min-h-0 flex-1">
    {#if loading}
      <div class="absolute inset-0 flex items-center justify-center bg-zinc-100">
        <span class="text-sm text-zinc-400">Loading graph…</span>
      </div>
    {:else if nodes.length === 0}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-100">
        <span class="text-sm text-zinc-500">No entities resolved yet.</span>
        <span class="text-xs text-zinc-400">Entities are extracted automatically as events are ingested.</span>
      </div>
    {:else}
      <canvas
        bind:this={canvas}
        class="absolute inset-0 block"
        onmousemove={onMouseMove}
        onmousedown={onMouseDown}
        onmouseup={onMouseUp}
        onmouseleave={onMouseLeave}
        onwheel={onWheel}
        style="cursor:{tooltipNode ? 'pointer' : isPanning ? 'grabbing' : 'grab'}"
      ></canvas>
      {#if tooltipNode}
        <div
          class="pointer-events-none absolute z-10 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 shadow-lg"
          style="left:{tooltipX}px;top:{tooltipY}px;transform:translateY(-50%)"
        >
          <p class="text-sm font-medium text-zinc-900">{tooltipNode.canonical_name}</p>
          <p class="mt-0.5 font-mono text-[11px] text-zinc-400">{tooltipNode.type_label}</p>
          <div class="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400">
            <span>{tooltipNode.event_count} {tooltipNode.event_count === 1 ? 'event' : 'events'}</span>
            <span>·</span>
            <span>{(tooltipNode.confidence * 100).toFixed(0)}% confidence</span>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
