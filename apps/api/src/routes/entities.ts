import { Hono } from 'hono';
import { db } from '../db/client';
import { requireSession } from '../security/session';
import { extractAllMissingRelations } from '../entities/link';

export const entitiesRoutes = new Hono();

entitiesRoutes.get('/graph', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const [entitiesResult, relationsResult] = await Promise.all([
    db.execute(`
      SELECT
        e.id,
        e.canonical_name,
        e.confidence,
        oc.label AS type_label,
        COUNT(DISTINCT ee.event_id) AS event_count
      FROM entities e
      JOIN ontology_concepts oc ON oc.id = e.type_concept_id
      LEFT JOIN event_entities ee ON ee.entity_id = e.id
      GROUP BY e.id
      ORDER BY event_count DESC
      LIMIT 200
    `),
    db.execute(`
      SELECT
        er.from_entity_id AS from_id,
        er.to_entity_id AS to_id,
        oc.label,
        er.confidence
      FROM entity_relations er
      JOIN ontology_concepts oc ON oc.id = er.relation_concept_id
    `),
  ]);

  return c.json({
    entities: entitiesResult.rows.map((r) => ({
      id: r.id as string,
      canonical_name: r.canonical_name as string,
      type_label: r.type_label as string,
      confidence: r.confidence as number,
      event_count: Number(r.event_count),
    })),
    relations: relationsResult.rows.map((r) => ({
      from_id: r.from_id as string,
      to_id: r.to_id as string,
      label: r.label as string,
      confidence: r.confidence as number,
    })),
  });
});

entitiesRoutes.get('/:id/community', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const entityId = c.req.param('id');
  const result = await db.execute(
    `SELECT id, title, summary, importance, member_count, member_entity_ids
     FROM entity_communities WHERE stale = 0 ORDER BY importance DESC`,
  );

  for (const row of result.rows) {
    let members: string[];
    try { members = JSON.parse(row.member_entity_ids as string); } catch { continue; }
    if (!members.includes(entityId)) continue;

    const entityNames = await db.execute({
      sql: `SELECT canonical_name FROM entities WHERE id IN (${members.map(() => '?').join(',')})`,
      args: members,
    });

    return c.json({
      community: {
        id: row.id as string,
        title: row.title as string,
        summary: row.summary as string,
        importance: row.importance as number,
        member_count: row.member_count as number,
        member_names: entityNames.rows.map((r) => r.canonical_name as string),
      },
    });
  }

  return c.json({ community: null });
});

entitiesRoutes.post('/relations/resolve-all', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const created = await extractAllMissingRelations();
  return c.json({ created });
});
