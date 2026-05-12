export type PersistencePair = {
  dimension: 0 | 1;
  birth: number;
  death: number | null;
};

export type PersistenceResult = {
  h0ComponentCount: number;
  h1LoopCount: number;
  maxH0Persistence: number;
  pairs: PersistencePair[];
  gapEntityIds: string[];
};

type WeightedEdge = {
  from: string;
  to: string;
  weight: number;
};

const MAX_DISTANCE = 3.0;
const MAX_NODES = 500;

function buildDistanceMatrix(
  nodes: string[],
  edges: WeightedEdge[],
): { matrix: Float64Array; nodeIndex: Map<string, number> } {
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) nodeIndex.set(nodes[i], i);

  const n = nodes.length;
  const matrix = new Float64Array(n * n).fill(MAX_DISTANCE);

  for (let i = 0; i < n; i++) matrix[i * n + i] = 0;

  const adj = new Map<number, Array<{ to: number; w: number }>>();
  for (let i = 0; i < n; i++) adj.set(i, []);

  for (const e of edges) {
    const fi = nodeIndex.get(e.from);
    const ti = nodeIndex.get(e.to);
    if (fi === undefined || ti === undefined) continue;
    const w = Math.max(0, Math.min(e.weight, MAX_DISTANCE));
    if (w < matrix[fi * n + ti]) {
      matrix[fi * n + ti] = w;
      matrix[ti * n + fi] = w;
    }
    adj.get(fi)!.push({ to: ti, w });
    adj.get(ti)!.push({ to: fi, w });
  }

  for (let src = 0; src < n; src++) {
    const dist = new Float64Array(n).fill(MAX_DISTANCE);
    dist[src] = 0;
    const visited = new Uint8Array(n);
    const queue: number[] = [src];

    while (queue.length > 0) {
      let minIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if (dist[queue[i]] < dist[queue[minIdx]]) minIdx = i;
      }
      const u = queue[minIdx];
      queue[minIdx] = queue[queue.length - 1];
      queue.pop();

      if (visited[u]) continue;
      visited[u] = 1;

      for (const { to: v, w } of adj.get(u)!) {
        const nd = dist[u] + w;
        if (nd < dist[v]) {
          dist[v] = nd;
          if (!visited[v]) queue.push(v);
        }
      }
    }

    for (let j = 0; j < n; j++) {
      if (dist[j] < matrix[src * n + j]) {
        matrix[src * n + j] = dist[j];
        matrix[j * n + src] = dist[j];
      }
    }
  }

  return { matrix, nodeIndex };
}

function selectTopConnectedNodes(
  nodes: string[],
  edges: WeightedEdge[],
): { selectedNodes: string[]; selectedEdges: WeightedEdge[] } {
  if (nodes.length <= MAX_NODES) return { selectedNodes: nodes, selectedEdges: edges };

  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n, 0);
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const sorted = [...degree.entries()].sort((a, b) => b[1] - a[1]);
  const kept = new Set(sorted.slice(0, MAX_NODES).map(([id]) => id));

  const selectedNodes = nodes.filter((n) => kept.has(n));
  const selectedEdges = edges.filter((e) => kept.has(e.from) && kept.has(e.to));

  return { selectedNodes, selectedEdges };
}

function computeH0Persistence(
  n: number,
  sortedEdges: Array<{ i: number; j: number; dist: number }>,
): { pairs: PersistencePair[]; componentCount: number; maxPersistence: number; parentArr: Int32Array; componentBirth: Float64Array } {
  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  const birth = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    parent[i] = i;
    rank[i] = 0;
    birth[i] = 0;
  }

  function find(x: number): number {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let curr = x;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  }

  function union(a: number, b: number, dist: number): PersistencePair | null {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return null;

    const younger = birth[ra] >= birth[rb] ? ra : rb;
    const older = younger === ra ? rb : ra;

    const deathDist = dist;
    const birthDist = birth[younger];

    if (rank[older] < rank[younger]) {
      parent[older] = younger;
      birth[younger] = Math.min(birth[younger], birth[older]);
    } else if (rank[older] > rank[younger]) {
      parent[younger] = older;
    } else {
      parent[younger] = older;
      rank[older]++;
    }

    return { dimension: 0, birth: birthDist, death: deathDist };
  }

  const pairs: PersistencePair[] = [];

  for (const edge of sortedEdges) {
    const pair = union(edge.i, edge.j, edge.dist);
    if (pair) pairs.push(pair);
  }

  const components = new Set<number>();
  for (let i = 0; i < n; i++) components.add(find(i));

  for (const root of components) {
    pairs.push({ dimension: 0, birth: birth[root], death: null });
  }

  let maxPersistence = 0;
  for (const p of pairs) {
    if (p.death !== null) {
      const persistence = p.death - p.birth;
      if (persistence > maxPersistence) maxPersistence = persistence;
    }
  }

  return {
    pairs,
    componentCount: components.size,
    maxPersistence,
    parentArr: parent,
    componentBirth: birth,
  };
}

function computeH1Persistence(
  n: number,
  sortedEdges: Array<{ i: number; j: number; dist: number }>,
): PersistencePair[] {
  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    parent[i] = i;
    rank[i] = 0;
  }

  function find(x: number): number {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let curr = x;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  }

  function union(a: number, b: number): boolean {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
    return true;
  }

  const edgePresent = new Map<string, number>();
  const adjAtThreshold = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) adjAtThreshold.set(i, new Set());

  const pairs: PersistencePair[] = [];

  for (const edge of sortedEdges) {
    const { i, j, dist } = edge;
    const merged = union(i, j);

    edgePresent.set(`${Math.min(i, j)}_${Math.max(i, j)}`, dist);
    adjAtThreshold.get(i)!.add(j);
    adjAtThreshold.get(j)!.add(i);

    if (!merged) {
      const birthDist = dist;
      let deathDist: number | null = null;

      const neighborsI = adjAtThreshold.get(i)!;
      const neighborsJ = adjAtThreshold.get(j)!;
      const smaller = neighborsI.size < neighborsJ.size ? neighborsI : neighborsJ;
      const larger = neighborsI.size < neighborsJ.size ? neighborsJ : neighborsI;

      for (const w of smaller) {
        if (larger.has(w)) {
          deathDist = dist;
          break;
        }
      }

      pairs.push({ dimension: 1, birth: birthDist, death: deathDist });
    }
  }

  return pairs;
}

function detectGapEntities(
  nodes: string[],
  h0Pairs: PersistencePair[],
  n: number,
  sortedEdges: Array<{ i: number; j: number; dist: number }>,
): string[] {
  const finitePersistences = h0Pairs
    .filter((p) => p.dimension === 0 && p.death !== null)
    .map((p) => p.death! - p.birth);

  if (finitePersistences.length === 0) {
    if (h0Pairs.filter((p) => p.death === null).length > 1) {
      return nodes.slice();
    }
    return [];
  }

  finitePersistences.sort((a, b) => a - b);
  const medianIdx = Math.floor(finitePersistences.length / 2);
  const threshold = finitePersistences[medianIdx];

  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  const componentBirth = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    parent[i] = i;
    rank[i] = 0;
    componentBirth[i] = 0;
  }

  function find(x: number): number {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let curr = x;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  }

  const mergeTime = new Float64Array(n).fill(Number.POSITIVE_INFINITY);

  for (const edge of sortedEdges) {
    const ra = find(edge.i);
    const rb = find(edge.j);
    if (ra === rb) continue;

    const younger = componentBirth[ra] >= componentBirth[rb] ? ra : rb;
    const older = younger === ra ? rb : ra;
    const persistence = edge.dist - componentBirth[younger];

    if (persistence > threshold) {
      for (let k = 0; k < n; k++) {
        if (find(k) === younger && mergeTime[k] === Number.POSITIVE_INFINITY) {
          mergeTime[k] = edge.dist;
        }
      }
    }

    if (rank[older] < rank[younger]) {
      parent[older] = younger;
      componentBirth[younger] = Math.min(componentBirth[younger], componentBirth[older]);
    } else if (rank[older] > rank[younger]) {
      parent[younger] = older;
    } else {
      parent[younger] = older;
      rank[older]++;
    }
  }

  const gapIds: string[] = [];
  for (let i = 0; i < n; i++) {
    if (mergeTime[i] > threshold) gapIds.push(nodes[i]);
  }

  const neverMergedRoots = new Set<number>();
  for (let i = 0; i < n; i++) neverMergedRoots.add(find(i));
  if (neverMergedRoots.size > 1) {
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (root !== find(0) && !gapIds.includes(nodes[i])) {
        gapIds.push(nodes[i]);
      }
    }
  }

  return gapIds;
}

export function computePersistence(
  rawNodes: string[],
  rawEdges: WeightedEdge[],
): PersistenceResult {
  if (rawNodes.length === 0) {
    return {
      h0ComponentCount: 0,
      h1LoopCount: 0,
      maxH0Persistence: 0,
      pairs: [],
      gapEntityIds: [],
    };
  }

  const { selectedNodes, selectedEdges } = selectTopConnectedNodes(rawNodes, rawEdges);
  const { matrix } = buildDistanceMatrix(selectedNodes, selectedEdges);
  const n = selectedNodes.length;

  const edgeList: Array<{ i: number; j: number; dist: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = matrix[i * n + j];
      if (d < MAX_DISTANCE) {
        edgeList.push({ i, j, dist: d });
      }
    }
  }

  edgeList.sort((a, b) => a.dist - b.dist);

  const h0Result = computeH0Persistence(n, edgeList);
  const h1Pairs = computeH1Persistence(n, edgeList);

  const allPairs = [...h0Result.pairs, ...h1Pairs];
  const h1LoopCount = h1Pairs.filter((p) => p.death === null || p.death - p.birth > 0.01).length;

  const gapEntityIds = detectGapEntities(selectedNodes, h0Result.pairs, n, edgeList);

  return {
    h0ComponentCount: h0Result.componentCount,
    h1LoopCount,
    maxH0Persistence: h0Result.maxPersistence,
    pairs: allPairs,
    gapEntityIds,
  };
}
