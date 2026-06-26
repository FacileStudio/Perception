import { randomUUID } from "node:crypto";
import { db } from "../db/client";

export async function mergeEntities(
	sourceId: string,
	targetId: string,
	workspaceId: string,
): Promise<void> {
	if (sourceId === targetId) {
		throw new Error("Cannot merge entity with itself");
	}

	const [sourceRow, targetRow] = await Promise.all([
		db.execute({
			sql: "SELECT id, canonical_name FROM entities WHERE id = ? AND workspace_id = ?",
			args: [sourceId, workspaceId],
		}),
		db.execute({
			sql: "SELECT id, canonical_name FROM entities WHERE id = ? AND workspace_id = ?",
			args: [targetId, workspaceId],
		}),
	]);

	if (sourceRow.rows.length === 0) throw new Error("Source entity not found");
	if (targetRow.rows.length === 0) throw new Error("Target entity not found");

	const sourceName = sourceRow.rows[0].canonical_name as string;
	const targetName = targetRow.rows[0].canonical_name as string;

	await db.execute({
		sql: "UPDATE event_entities SET entity_id = ? WHERE entity_id = ? AND workspace_id = ?",
		args: [targetId, sourceId, workspaceId],
	});

	await db.execute({
		sql: "UPDATE entity_aliases SET entity_id = ? WHERE entity_id = ? AND workspace_id = ?",
		args: [targetId, sourceId, workspaceId],
	});

	await db.execute({
		sql: "UPDATE entity_relations SET from_entity_id = ? WHERE from_entity_id = ? AND workspace_id = ?",
		args: [targetId, sourceId, workspaceId],
	});

	await db.execute({
		sql: "UPDATE entity_relations SET to_entity_id = ? WHERE to_entity_id = ? AND workspace_id = ?",
		args: [targetId, sourceId, workspaceId],
	});

	await db.execute({
		sql: `DELETE FROM entity_relations
          WHERE from_entity_id = to_entity_id AND workspace_id = ?`,
		args: [workspaceId],
	});

	const communities = await db.execute({
		sql: "SELECT id, member_entity_ids FROM entity_communities WHERE workspace_id = ?",
		args: [workspaceId],
	});

	for (const row of communities.rows) {
		let members: string[];
		try {
			members = JSON.parse(row.member_entity_ids as string);
		} catch {
			continue;
		}
		if (!members.includes(sourceId)) continue;
		const updated = members.filter((m) => m !== sourceId);
		if (!updated.includes(targetId)) updated.push(targetId);
		await db.execute({
			sql: "UPDATE entity_communities SET member_entity_ids = ?, member_count = ? WHERE id = ? AND workspace_id = ?",
			args: [
				JSON.stringify(updated),
				updated.length,
				row.id as string,
				workspaceId,
			],
		});
	}

	const existingNarrative = await db.execute({
		sql: "SELECT entity_id FROM entity_narratives WHERE entity_id = ? AND workspace_id = ?",
		args: [targetId, workspaceId],
	});

	if (existingNarrative.rows.length > 0) {
		await db.execute({
			sql: "DELETE FROM entity_narratives WHERE entity_id = ? AND workspace_id = ?",
			args: [sourceId, workspaceId],
		});
	} else {
		await db.execute({
			sql: "UPDATE entity_narratives SET entity_id = ? WHERE entity_id = ? AND workspace_id = ?",
			args: [targetId, sourceId, workspaceId],
		});
	}

	await db.execute({
		sql: "DELETE FROM entities WHERE id = ? AND workspace_id = ?",
		args: [sourceId, workspaceId],
	});

	const now = new Date().toISOString();
	await db.execute({
		sql: `INSERT INTO entity_merge_log (id, source_entity_id, target_entity_id, source_name, target_name, merged_at, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
		args: [
			randomUUID(),
			sourceId,
			targetId,
			sourceName,
			targetName,
			now,
			workspaceId,
		],
	});
}

export async function splitEntity(
	entityId: string,
	aliasIds: string[],
	newName: string,
	workspaceId: string,
): Promise<string> {
	if (aliasIds.length === 0) {
		throw new Error("Must specify at least one alias to split");
	}

	const entityRow = await db.execute({
		sql: "SELECT id, type_concept_id FROM entities WHERE id = ? AND workspace_id = ?",
		args: [entityId, workspaceId],
	});

	if (entityRow.rows.length === 0) throw new Error("Entity not found");

	const typeConcept = entityRow.rows[0].type_concept_id as string;
	const newId = `entity_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
	const now = new Date().toISOString();

	await db.execute({
		sql: `INSERT INTO entities (id, type_concept_id, canonical_name, description, status, confidence, created_at, updated_at, workspace_id)
          VALUES (?, ?, ?, '', NULL, 0.72, ?, ?, ?)`,
		args: [newId, typeConcept, newName, now, now, workspaceId],
	});

	const placeholders = aliasIds.map(() => "?").join(",");
	await db.execute({
		sql: `UPDATE entity_aliases SET entity_id = ? WHERE id IN (${placeholders}) AND entity_id = ? AND workspace_id = ?`,
		args: [newId, ...aliasIds, entityId, workspaceId],
	});

	const movedAliases = await db.execute({
		sql: "SELECT alias_value FROM entity_aliases WHERE entity_id = ? AND workspace_id = ?",
		args: [newId, workspaceId],
	});

	const aliasValues = movedAliases.rows.map((r) => r.alias_value as string);

	if (aliasValues.length > 0) {
		const eventIds = await db.execute({
			sql: `SELECT DISTINCT ee.event_id
            FROM event_entities ee
            JOIN events ev ON ev.id = ee.event_id
            WHERE ee.entity_id = ? AND ee.workspace_id = ?
              AND EXISTS (
                SELECT 1 FROM entity_aliases ea
                WHERE ea.entity_id = ? AND ea.workspace_id = ?
                  AND ev.raw_payload LIKE '%' || ea.alias_value || '%'
              )`,
			args: [entityId, workspaceId, newId, workspaceId],
		});

		for (const row of eventIds.rows) {
			await db.execute({
				sql: "UPDATE event_entities SET entity_id = ? WHERE event_id = ? AND entity_id = ? AND workspace_id = ?",
				args: [newId, row.event_id as string, entityId, workspaceId],
			});
		}
	}

	return newId;
}
