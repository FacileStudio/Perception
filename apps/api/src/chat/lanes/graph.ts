import { db } from "../../db/client";
import { rowToEvent } from "../../db/row";
import { multiHopNeighbors } from "../../entities/graph-traversal";
import { EVENT_LIST_ORDER_BY } from "../../events/order";
import type { ScoredEvent } from "./types";

export async function graphLane(
	seedEntityIds: string[],
	workspaceId = "",
): Promise<Array<ScoredEvent<"graph"> & { entity_names: string[] }>> {
	if (seedEntityIds.length === 0) return [];

	try {
		const { nodes } = await multiHopNeighbors(seedEntityIds, workspaceId, 2);

		const seedSet = new Set(seedEntityIds);
		const hop1Ids: string[] = [];
		const hop2Ids: string[] = [];

		const adjacency = new Map<string, Set<string>>();
		const rawEdges = await fetchEdgesForNodes(
			nodes.map((n) => n.id),
			workspaceId,
		);

		for (const e of rawEdges) {
			if (!adjacency.has(e.from)) adjacency.set(e.from, new Set());
			if (!adjacency.has(e.to)) adjacency.set(e.to, new Set());
			adjacency.get(e.from)?.add(e.to);
			adjacency.get(e.to)?.add(e.from);
		}

		for (const node of nodes) {
			if (seedSet.has(node.id)) continue;
			const neighbors = adjacency.get(node.id);
			const directlyConnected =
				neighbors && [...neighbors].some((n) => seedSet.has(n));
			if (directlyConnected) {
				hop1Ids.push(node.id);
			} else {
				hop2Ids.push(node.id);
			}
		}

		const neighborIds = [...hop1Ids, ...hop2Ids];
		if (neighborIds.length === 0) return [];

		const confidenceMap = new Map<string, number>();
		for (const e of rawEdges) {
			for (const nid of [e.from, e.to]) {
				const existing = confidenceMap.get(nid) ?? 0;
				if (e.confidence > existing) confidenceMap.set(nid, e.confidence);
			}
		}

		const hop1Set = new Set(hop1Ids);
		const placeholders = neighborIds.map(() => "?").join(",");
		const wsFilter = workspaceId ? " AND e.workspace_id = ?" : "";
		const args = workspaceId ? [...neighborIds, workspaceId] : neighborIds;

		const result = await db.execute({
			sql: `SELECT e.*, ent.canonical_name AS matched_entity_name, ee.entity_id AS matched_entity_id
            FROM event_entities ee
            JOIN events e ON e.id = ee.event_id
            JOIN entities ent ON ent.id = ee.entity_id
            WHERE ee.entity_id IN (${placeholders})${wsFilter}
            GROUP BY e.id
            ORDER BY ${EVENT_LIST_ORDER_BY}
            LIMIT 20`,
			args,
		});

		return result.rows.map((r) => {
			const entityId = r.matched_entity_id as string;
			const baseConf = confidenceMap.get(entityId) ?? 0.5;
			const isHop1 = hop1Set.has(entityId);
			const score = isHop1 ? baseConf * 0.8 : baseConf * 0.5;

			return {
				...rowToEvent(r as unknown as Record<string, unknown>),
				score,
				source: "graph" as const,
				entity_names:
					typeof r.matched_entity_name === "string"
						? [r.matched_entity_name]
						: [],
			};
		});
	} catch {
		return [];
	}
}

async function fetchEdgesForNodes(
	nodeIds: string[],
	workspaceId: string,
): Promise<{ from: string; to: string; confidence: number }[]> {
	if (nodeIds.length === 0) return [];
	const placeholders = nodeIds.map(() => "?").join(",");
	const wsFilter = workspaceId ? " AND workspace_id = ?" : "";
	const args = workspaceId
		? [...nodeIds, ...nodeIds, workspaceId]
		: [...nodeIds, ...nodeIds];

	const result = await db.execute({
		sql: `SELECT from_entity_id, to_entity_id, confidence
          FROM entity_relations
          WHERE (from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders}))${wsFilter}`,
		args,
	});

	return result.rows.map((r) => ({
		from: r.from_entity_id as string,
		to: r.to_entity_id as string,
		confidence: r.confidence as number,
	}));
}
