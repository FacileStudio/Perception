import { db } from '../db/client';

type Edge = { from: string; to: string; weight: number };
type Graph = { nodes: Set<string>; edges: Edge[]; adjacency: Map<string, Map<string, number>> };

async function loadGraph(): Promise<Graph> {
  const result = await db.execute(
    `SELECT from_entity_id, to_entity_id, MAX(confidence) AS weight
     FROM entity_relations
     GROUP BY from_entity_id, to_entity_id`,
  );

  const nodes = new Set<string>();
  const edges: Edge[] = [];
  const adjacency = new Map<string, Map<string, number>>();

  const addAdj = (a: string, b: string, w: number) => {
    if (!adjacency.has(a)) adjacency.set(a, new Map());
    const existing = adjacency.get(a)!.get(b) ?? 0;
    adjacency.get(a)!.set(b, Math.max(existing, w));
  };

  for (const r of result.rows) {
    const from = r.from_entity_id as string;
    const to = r.to_entity_id as string;
    const weight = (r.weight as number) ?? 0.5;
    nodes.add(from);
    nodes.add(to);
    edges.push({ from, to, weight });
    addAdj(from, to, weight);
    addAdj(to, from, weight);
  }

  return { nodes, edges, adjacency };
}

function louvain(graph: Graph): Map<string, number> {
  const { nodes, adjacency } = graph;
  if (nodes.size === 0) return new Map();

  const totalWeight = graph.edges.reduce((s, e) => s + e.weight, 0) * 2;
  if (totalWeight === 0) return new Map();

  const community = new Map<string, number>();
  let nextCommunityId = 0;
  for (const node of nodes) {
    community.set(node, nextCommunityId++);
  }

  const nodeDegree = new Map<string, number>();
  for (const node of nodes) {
    let deg = 0;
    const neighbors = adjacency.get(node);
    if (neighbors) for (const w of neighbors.values()) deg += w;
    nodeDegree.set(node, deg);
  }

  const communityInternalWeight = new Map<number, number>();
  const communityTotalWeight = new Map<number, number>();
  for (const node of nodes) {
    const c = community.get(node)!;
    communityTotalWeight.set(c, nodeDegree.get(node)!);
    communityInternalWeight.set(c, 0);
  }

  let improved = true;
  let iterations = 0;
  const maxIterations = 50;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (const node of nodes) {
      const currentComm = community.get(node)!;
      const ki = nodeDegree.get(node)!;
      const neighbors = adjacency.get(node);
      if (!neighbors || neighbors.size === 0) continue;

      const neighborComms = new Map<number, number>();
      for (const [neighbor, weight] of neighbors) {
        const nc = community.get(neighbor)!;
        neighborComms.set(nc, (neighborComms.get(nc) ?? 0) + weight);
      }

      const kiIn = neighborComms.get(currentComm) ?? 0;
      const sigTot = communityTotalWeight.get(currentComm) ?? 0;
      const removeGain = kiIn - (sigTot * ki) / totalWeight;

      let bestComm = currentComm;
      let bestGain = 0;

      for (const [nc, kiInNew] of neighborComms) {
        if (nc === currentComm) continue;
        const sigTotNew = communityTotalWeight.get(nc) ?? 0;
        const gain = kiInNew - (sigTotNew * ki) / totalWeight - removeGain;
        if (gain > bestGain) {
          bestGain = gain;
          bestComm = nc;
        }
      }

      if (bestComm !== currentComm) {
        communityTotalWeight.set(currentComm, (communityTotalWeight.get(currentComm) ?? 0) - ki);
        communityTotalWeight.set(bestComm, (communityTotalWeight.get(bestComm) ?? 0) + ki);
        community.set(node, bestComm);
        improved = true;
      }
    }
  }

  const uniqueComms = new Set(community.values());
  const remap = new Map<number, number>();
  let idx = 0;
  for (const c of uniqueComms) remap.set(c, idx++);
  for (const [node, c] of community) community.set(node, remap.get(c)!);

  return community;
}

export type DetectedCommunity = {
  id: number;
  memberEntityIds: string[];
};

export async function detectCommunities(minSize = 2): Promise<DetectedCommunity[]> {
  const graph = await loadGraph();
  const assignments = louvain(graph);

  const groups = new Map<number, string[]>();
  for (const [nodeId, commId] of assignments) {
    if (!groups.has(commId)) groups.set(commId, []);
    groups.get(commId)!.push(nodeId);
  }

  const communities: DetectedCommunity[] = [];
  for (const [id, members] of groups) {
    if (members.length >= minSize) {
      communities.push({ id, memberEntityIds: members });
    }
  }

  return communities.sort((a, b) => b.memberEntityIds.length - a.memberEntityIds.length);
}
