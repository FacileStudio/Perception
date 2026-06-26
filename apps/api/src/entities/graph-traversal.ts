import { db } from "../db/client";

export type GraphNode = { id: string; name: string; type: string };
export type GraphEdge = {
	from: string;
	to: string;
	label: string;
	confidence: number;
};
export type PathResult = {
	path: GraphNode[];
	edges: GraphEdge[];
	totalConfidence: number;
};

const MAX_NODES = 100;

async function fetchFrontierEdges(
	frontier: Set<string>,
	workspaceId: string,
): Promise<
	{ fromId: string; toId: string; label: string; confidence: number }[]
> {
	if (frontier.size === 0) return [];
	const ids = [...frontier];
	const placeholders = ids.map(() => "?").join(",");
	const wsFilter = workspaceId ? " AND er.workspace_id = ?" : "";
	const args = workspaceId ? [...ids, ...ids, workspaceId] : [...ids, ...ids];

	const result = await db.execute({
		sql: `SELECT er.from_entity_id, er.to_entity_id, oc.label, er.confidence
          FROM entity_relations er
          JOIN ontology_concepts oc ON oc.id = er.relation_concept_id
          WHERE (er.from_entity_id IN (${placeholders}) OR er.to_entity_id IN (${placeholders}))${wsFilter}`,
		args,
	});

	return result.rows.map((r) => ({
		fromId: r.from_entity_id as string,
		toId: r.to_entity_id as string,
		label: r.label as string,
		confidence: r.confidence as number,
	}));
}

async function fetchNodeDetails(
	nodeIds: Set<string>,
	workspaceId: string,
): Promise<Map<string, GraphNode>> {
	if (nodeIds.size === 0) return new Map();
	const ids = [...nodeIds];
	const placeholders = ids.map(() => "?").join(",");
	const wsFilter = workspaceId ? " AND e.workspace_id = ?" : "";
	const args = workspaceId ? [...ids, workspaceId] : ids;

	const result = await db.execute({
		sql: `SELECT e.id, e.canonical_name, oc.label AS type_label
          FROM entities e
          JOIN ontology_concepts oc ON oc.id = e.type_concept_id
          WHERE e.id IN (${placeholders})${wsFilter}`,
		args,
	});

	const map = new Map<string, GraphNode>();
	for (const r of result.rows) {
		map.set(r.id as string, {
			id: r.id as string,
			name: r.canonical_name as string,
			type: r.type_label as string,
		});
	}
	return map;
}

export async function shortestPath(
	fromId: string,
	toId: string,
	workspaceId: string,
	maxDepth = 5,
): Promise<PathResult | null> {
	if (fromId === toId) {
		const nodes = await fetchNodeDetails(new Set([fromId]), workspaceId);
		const node = nodes.get(fromId);
		if (!node) return null;
		return { path: [node], edges: [], totalConfidence: 1 };
	}

	const visited = new Map<
		string,
		{
			parent: string | null;
			edge: {
				from: string;
				to: string;
				label: string;
				confidence: number;
			} | null;
		}
	>();
	visited.set(fromId, { parent: null, edge: null });
	let frontier = new Set([fromId]);

	for (let depth = 0; depth < maxDepth; depth++) {
		if (frontier.size === 0) break;

		const rawEdges = await fetchFrontierEdges(frontier, workspaceId);
		const nextFrontier = new Set<string>();

		for (const e of rawEdges) {
			const neighbor = frontier.has(e.fromId) ? e.toId : e.fromId;
			if (visited.has(neighbor)) continue;

			const source = frontier.has(e.fromId) ? e.fromId : e.toId;
			visited.set(neighbor, {
				parent: source,
				edge: {
					from: e.fromId,
					to: e.toId,
					label: e.label,
					confidence: e.confidence,
				},
			});
			nextFrontier.add(neighbor);

			if (neighbor === toId) {
				return buildPath(visited, fromId, toId, workspaceId);
			}
		}

		frontier = nextFrontier;
	}

	return null;
}

async function buildPath(
	visited: Map<
		string,
		{
			parent: string | null;
			edge: {
				from: string;
				to: string;
				label: string;
				confidence: number;
			} | null;
		}
	>,
	fromId: string,
	toId: string,
	workspaceId: string,
): Promise<PathResult> {
	const nodeIds: string[] = [];
	const rawEdges: {
		from: string;
		to: string;
		label: string;
		confidence: number;
	}[] = [];
	let current = toId;

	while (current !== fromId) {
		nodeIds.push(current);
		const entry = visited.get(current);
		if (!entry?.edge || !entry.parent) break;
		rawEdges.push(entry.edge);
		current = entry.parent;
	}
	nodeIds.push(fromId);
	nodeIds.reverse();
	rawEdges.reverse();

	const nodeMap = await fetchNodeDetails(new Set(nodeIds), workspaceId);
	const path = nodeIds.map(
		(id) => nodeMap.get(id) ?? { id, name: id, type: "unknown" },
	);
	const edges: GraphEdge[] = rawEdges.map((e) => ({
		from: e.from,
		to: e.to,
		label: e.label,
		confidence: e.confidence,
	}));
	const totalConfidence = edges.reduce((acc, e) => acc * e.confidence, 1);

	return { path, edges, totalConfidence };
}

export async function multiHopNeighbors(
	seedIds: string[],
	workspaceId: string,
	hops = 2,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
	const allNodeIds = new Set<string>(seedIds);
	const edgeSet = new Map<string, GraphEdge>();
	let frontier = new Set<string>(seedIds);

	for (let hop = 0; hop < hops; hop++) {
		if (frontier.size === 0 || allNodeIds.size >= MAX_NODES) break;

		const rawEdges = await fetchFrontierEdges(frontier, workspaceId);
		const nextFrontier = new Set<string>();

		for (const e of rawEdges) {
			const edgeKey = `${e.fromId}:${e.toId}:${e.label}`;
			if (!edgeSet.has(edgeKey)) {
				edgeSet.set(edgeKey, {
					from: e.fromId,
					to: e.toId,
					label: e.label,
					confidence: e.confidence,
				});
			}

			for (const nid of [e.fromId, e.toId]) {
				if (!allNodeIds.has(nid)) {
					allNodeIds.add(nid);
					nextFrontier.add(nid);
					if (allNodeIds.size >= MAX_NODES) break;
				}
			}
			if (allNodeIds.size >= MAX_NODES) break;
		}

		frontier = nextFrontier;
	}

	const nodeMap = await fetchNodeDetails(allNodeIds, workspaceId);
	const nodes = [...allNodeIds]
		.map((id) => nodeMap.get(id) ?? { id, name: id, type: "unknown" })
		.filter((n) => nodeMap.has(n.id));

	return { nodes, edges: [...edgeSet.values()] };
}
