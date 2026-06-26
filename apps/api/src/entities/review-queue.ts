import { db } from "../db/client";
import { combinedSimilarity } from "./link";
import { mergeEntities } from "./merge";

export async function generateMatchCandidates(
	workspaceId: string,
): Promise<number> {
	const entities = await db.execute({
		sql: "SELECT id, canonical_name FROM entities WHERE workspace_id = ? AND canonical_name != ''",
		args: [workspaceId],
	});

	const existingRelations = await db.execute({
		sql: `SELECT from_entity_id, to_entity_id FROM entity_relations er
          JOIN ontology_concepts oc ON oc.id = er.relation_concept_id
          WHERE er.workspace_id = ? AND oc.label = 'same_entity'`,
		args: [workspaceId],
	});

	const linkedPairs = new Set<string>();
	for (const r of existingRelations.rows) {
		const a = r.from_entity_id as string;
		const b = r.to_entity_id as string;
		linkedPairs.add(`${a}:${b}`);
		linkedPairs.add(`${b}:${a}`);
	}

	const existingCandidates = await db.execute({
		sql: "SELECT source_entity_id, target_entity_id FROM entity_match_candidates WHERE workspace_id = ?",
		args: [workspaceId],
	});

	const candidatePairs = new Set<string>();
	for (const r of existingCandidates.rows) {
		const a = r.source_entity_id as string;
		const b = r.target_entity_id as string;
		candidatePairs.add(`${a}:${b}`);
		candidatePairs.add(`${b}:${a}`);
	}

	const rows = entities.rows.map((r) => ({
		id: r.id as string,
		name: r.canonical_name as string,
	}));

	let count = 0;
	const now = new Date().toISOString();

	for (let i = 0; i < rows.length; i++) {
		for (let j = i + 1; j < rows.length; j++) {
			const a = rows[i];
			const b = rows[j];
			const pairKey = `${a.id}:${b.id}`;

			if (linkedPairs.has(pairKey) || candidatePairs.has(pairKey)) continue;

			const sim = combinedSimilarity(a.name, b.name);
			if (sim <= 0.5 || sim >= 0.85) continue;

			await db.execute({
				sql: `INSERT INTO entity_match_candidates (source_entity_id, target_entity_id, similarity_score, match_method, status, created_at, workspace_id)
              VALUES (?, ?, ?, 'combined_similarity', 'pending', ?, ?)
              ON CONFLICT(source_entity_id, target_entity_id) DO NOTHING`,
				args: [a.id, b.id, sim, now, workspaceId],
			});

			candidatePairs.add(pairKey);
			candidatePairs.add(`${b.id}:${a.id}`);
			count++;
		}
	}

	return count;
}

export async function getMatchCandidates(
	workspaceId: string,
	status?: string,
): Promise<
	Array<{
		id: string;
		source_entity_id: string;
		source_entity_name: string;
		target_entity_id: string;
		target_entity_name: string;
		similarity_score: number;
		match_method: string;
		status: string;
		created_at: string;
	}>
> {
	const statusClause = status ? " AND mc.status = ?" : "";
	const args = status ? [workspaceId, status] : [workspaceId];

	const result = await db.execute({
		sql: `SELECT mc.id, mc.source_entity_id, mc.target_entity_id,
            mc.similarity_score, mc.match_method, mc.status, mc.created_at,
            se.canonical_name AS source_name, te.canonical_name AS target_name
          FROM entity_match_candidates mc
          JOIN entities se ON se.id = mc.source_entity_id
          JOIN entities te ON te.id = mc.target_entity_id
          WHERE mc.workspace_id = ?${statusClause}
          ORDER BY mc.similarity_score DESC`,
		args,
	});

	return result.rows.map((r) => ({
		id: r.id as string,
		source_entity_id: r.source_entity_id as string,
		source_entity_name: r.source_name as string,
		target_entity_id: r.target_entity_id as string,
		target_entity_name: r.target_name as string,
		similarity_score: r.similarity_score as number,
		match_method: r.match_method as string,
		status: r.status as string,
		created_at: r.created_at as string,
	}));
}

export async function resolveCandidate(
	candidateId: string,
	decision: "approve" | "reject",
	workspaceId: string,
): Promise<void> {
	const row = await db.execute({
		sql: "SELECT id, source_entity_id, target_entity_id, status FROM entity_match_candidates WHERE id = ? AND workspace_id = ?",
		args: [candidateId, workspaceId],
	});

	if (row.rows.length === 0) throw new Error("Candidate not found");
	if (row.rows[0].status !== "pending") return;

	const now = new Date().toISOString();
	const newStatus = decision === "approve" ? "approved" : "rejected";

	await db.execute({
		sql: "UPDATE entity_match_candidates SET status = ?, resolved_at = ? WHERE id = ? AND workspace_id = ?",
		args: [newStatus, now, candidateId, workspaceId],
	});

	if (decision === "approve") {
		const sourceId = row.rows[0].source_entity_id as string;
		const targetId = row.rows[0].target_entity_id as string;
		await mergeEntities(sourceId, targetId, workspaceId);
	}
}
