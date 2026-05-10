import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { detectCommunities } from './detect';
import { generateCommunitySummary } from './summarize';

async function membershipHash(memberIds: string[]): Promise<string> {
  const sorted = [...memberIds].sort().join(',');
  const hash = new Bun.CryptoHasher('sha256').update(sorted).digest('hex');
  return hash.slice(0, 16);
}

async function run(): Promise<void> {
  const communities = await detectCommunities(2);
  if (communities.length === 0) return;

  let created = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const community of communities) {
    const hash = await membershipHash(community.memberEntityIds);
    const membersJson = JSON.stringify(community.memberEntityIds);

    const existing = await db.execute({
      sql: `SELECT id, member_entity_ids, stale FROM entity_communities WHERE membership_hash = ?`,
      args: [hash],
    });

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const isStale = row.stale as number;
      if (!isStale) {
        skipped++;
        continue;
      }
      const summary = await generateCommunitySummary(community.memberEntityIds);
      await db.execute({
        sql: `UPDATE entity_communities
              SET summary = ?, title = ?, importance = ?, member_entity_ids = ?,
                  member_count = ?, stale = 0, generated_at = ?
              WHERE id = ?`,
        args: [
          summary.summary, summary.title, summary.importance, membersJson,
          community.memberEntityIds.length, new Date().toISOString(), row.id as string,
        ],
      });
      refreshed++;
      continue;
    }

    const summary = await generateCommunitySummary(community.memberEntityIds);
    await db.execute({
      sql: `INSERT INTO entity_communities
            (id, membership_hash, member_entity_ids, member_count, title, summary, importance, generated_at, stale)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      args: [
        randomUUID(), hash, membersJson, community.memberEntityIds.length,
        summary.title, summary.summary, summary.importance, new Date().toISOString(),
      ],
    });
    created++;
  }

  const currentHashes = new Set<string>();
  for (const c of communities) {
    currentHashes.add(await membershipHash(c.memberEntityIds));
  }

  const allStored = await db.execute(`SELECT id, membership_hash FROM entity_communities`);
  for (const row of allStored.rows) {
    const hash = row.membership_hash as string;
    if (!currentHashes.has(hash)) {
      await db.execute({ sql: `DELETE FROM entity_communities WHERE id = ?`, args: [row.id as string] });
    }
  }

  if (created > 0 || refreshed > 0) {
    console.log(`[communities] ${created} created, ${refreshed} refreshed, ${skipped} unchanged`);
  }
}

export async function markCommunitiesStale(entityId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE entity_communities SET stale = 1
          WHERE member_entity_ids LIKE '%' || ? || '%'`,
    args: [entityId],
  });
}

export const communityWorker = { run };
