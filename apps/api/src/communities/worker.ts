import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { detectCommunities } from './detect';
import { generateCommunitySummary } from './summarize';
import { forEachWorkspace } from '../db/workspaces';

async function membershipHash(memberIds: string[]): Promise<string> {
  const sorted = [...memberIds].sort().join(',');
  const hash = new Bun.CryptoHasher('sha256').update(sorted).digest('hex');
  return hash.slice(0, 16);
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const communities = await detectCommunities(2, workspaceId);
    if (communities.length === 0) return;

    let created = 0;
    let refreshed = 0;
    let skipped = 0;

    for (const community of communities) {
      const hash = await membershipHash(community.memberEntityIds);
      const membersJson = JSON.stringify(community.memberEntityIds);

      const existing = await db.execute({
        sql: `SELECT id, member_entity_ids, stale FROM entity_communities WHERE membership_hash = ? AND workspace_id = ?`,
        args: [hash, workspaceId],
      });

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const isStale = row.stale as number;
        if (!isStale) {
          skipped++;
          continue;
        }
        const summary = await generateCommunitySummary(community.memberEntityIds, workspaceId);
        await db.execute({
          sql: `UPDATE entity_communities
                SET summary = ?, title = ?, importance = ?, member_entity_ids = ?,
                    member_count = ?, stale = 0, generated_at = ?
                WHERE id = ? AND workspace_id = ?`,
          args: [
            summary.summary, summary.title, summary.importance, membersJson,
            community.memberEntityIds.length, new Date().toISOString(), row.id as string, workspaceId,
          ],
        });
        refreshed++;
        continue;
      }

      const summary = await generateCommunitySummary(community.memberEntityIds, workspaceId);
      await db.execute({
        sql: `INSERT INTO entity_communities
              (id, membership_hash, member_entity_ids, member_count, title, summary, importance, generated_at, stale, workspace_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        args: [
          randomUUID(), hash, membersJson, community.memberEntityIds.length,
          summary.title, summary.summary, summary.importance, new Date().toISOString(), workspaceId,
        ],
      });
      created++;
    }

    const currentHashes = new Set<string>();
    for (const c of communities) {
      currentHashes.add(await membershipHash(c.memberEntityIds));
    }

    const allStored = await db.execute({
      sql: `SELECT id, membership_hash FROM entity_communities WHERE workspace_id = ?`,
      args: [workspaceId],
    });
    for (const row of allStored.rows) {
      const hash = row.membership_hash as string;
      if (!currentHashes.has(hash)) {
        await db.execute({ sql: `DELETE FROM entity_communities WHERE id = ? AND workspace_id = ?`, args: [row.id as string, workspaceId] });
      }
    }

    if (created > 0 || refreshed > 0) {
      console.log(`[communities] ${created} created, ${refreshed} refreshed, ${skipped} unchanged (workspace ${workspaceId})`);
    }
  });
}

export async function markCommunitiesStale(entityId: string, workspaceId?: string): Promise<void> {
  if (workspaceId) {
    await db.execute({
      sql: `UPDATE entity_communities SET stale = 1
            WHERE member_entity_ids LIKE '%' || ? || '%' AND workspace_id = ?`,
      args: [entityId, workspaceId],
    });
  } else {
    await db.execute({
      sql: `UPDATE entity_communities SET stale = 1
            WHERE member_entity_ids LIKE '%' || ? || '%'`,
      args: [entityId],
    });
  }
}

export const communityWorker = { run };
