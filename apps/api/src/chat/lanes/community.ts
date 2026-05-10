import { db } from '../../db/client';

export type CommunitySummary = {
  communityId: string;
  title: string;
  summary: string;
  importance: number;
  memberCount: number;
  matchedEntityNames: string[];
};

export async function communityLane(seedEntityIds: string[]): Promise<CommunitySummary[]> {
  if (seedEntityIds.length === 0) return [];

  try {
    const result = await db.execute(
      `SELECT id, title, summary, importance, member_count, member_entity_ids
       FROM entity_communities
       WHERE stale = 0
       ORDER BY importance DESC`,
    );

    const seedSet = new Set(seedEntityIds);
    const matched: CommunitySummary[] = [];

    for (const row of result.rows) {
      const membersJson = row.member_entity_ids as string;
      let members: string[];
      try {
        members = JSON.parse(membersJson);
      } catch {
        continue;
      }

      const overlap = members.filter((m) => seedSet.has(m));
      if (overlap.length === 0) continue;

      const entityNames = await db.execute({
        sql: `SELECT canonical_name FROM entities WHERE id IN (${overlap.map(() => '?').join(',')})`,
        args: overlap,
      });

      matched.push({
        communityId: row.id as string,
        title: row.title as string,
        summary: row.summary as string,
        importance: row.importance as number,
        memberCount: row.member_count as number,
        matchedEntityNames: entityNames.rows.map((r) => r.canonical_name as string),
      });
    }

    return matched.slice(0, 3);
  } catch {
    return [];
  }
}
