export type GraphHealthSnapshot = {
  nodeCount: number;
  edgeCount: number;
  degreeEntropy: number;
  normalizedEntropy: number;
  isolatedNodeRatio: number;
  largestComponentRatio: number;
  isolatedEntityIds: string[];
};

export function computeGraphHealth(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
  entityIdsWithEvents: Set<string>,
): GraphHealthSnapshot {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  if (nodeCount === 0) {
    return {
      nodeCount: 0, edgeCount: 0, degreeEntropy: 0, normalizedEntropy: 0,
      isolatedNodeRatio: 0, largestComponentRatio: 0, isolatedEntityIds: [],
    };
  }

  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n, 0);
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const degreeCounts = new Map<number, number>();
  for (const d of degree.values()) {
    degreeCounts.set(d, (degreeCounts.get(d) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of degreeCounts.values()) {
    const p = count / nodeCount;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(degreeCounts.size || 1);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  const isolatedEntityIds: string[] = [];
  let isolatedWithEvents = 0;
  for (const [nodeId, deg] of degree) {
    if (deg === 0 && entityIdsWithEvents.has(nodeId)) {
      isolatedEntityIds.push(nodeId);
      isolatedWithEvents++;
    }
  }
  const activeNodes = [...degree.keys()].filter((n) => entityIdsWithEvents.has(n)).length;
  const isolatedNodeRatio = activeNodes > 0 ? isolatedWithEvents / activeNodes : 0;

  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  for (const n of nodes) { parent.set(n, n); rank.set(n, 0); }

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let curr = x;
    while (curr !== root) { const next = parent.get(curr)!; parent.set(curr, root); curr = next; }
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const rankA = rank.get(ra)!;
    const rankB = rank.get(rb)!;
    if (rankA < rankB) parent.set(ra, rb);
    else if (rankA > rankB) parent.set(rb, ra);
    else { parent.set(rb, ra); rank.set(ra, rankA + 1); }
  }

  for (const e of edges) union(e.from, e.to);

  const componentSizes = new Map<string, number>();
  for (const n of nodes) {
    const root = find(n);
    componentSizes.set(root, (componentSizes.get(root) ?? 0) + 1);
  }

  let largestComponent = 0;
  for (const size of componentSizes.values()) {
    if (size > largestComponent) largestComponent = size;
  }
  const largestComponentRatio = nodeCount > 0 ? largestComponent / nodeCount : 0;

  return {
    nodeCount,
    edgeCount,
    degreeEntropy: entropy,
    normalizedEntropy,
    isolatedNodeRatio,
    largestComponentRatio,
    isolatedEntityIds: isolatedEntityIds.slice(0, 50),
  };
}
