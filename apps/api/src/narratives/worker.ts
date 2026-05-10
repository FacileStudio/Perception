import { db } from '../db/client';
import { generateNarrative } from './generate';

async function computeStaleness(entityId: string, sourceEventCount: number, generatedAt: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS cnt
          FROM events ev
          JOIN event_entities ee ON ee.event_id = ev.id
          WHERE ee.entity_id = ? AND ev.ingested_at > ?`,
    args: [entityId, generatedAt],
  });
  const newEvents = Number(result.rows[0]?.cnt ?? 0);
  return sourceEventCount > 0 ? newEvents / sourceEventCount : 0;
}

async function run(): Promise<void> {
  const topEntities = await db.execute(
    `SELECT ee.entity_id, COUNT(*) AS cnt
     FROM event_entities ee
     GROUP BY ee.entity_id
     ORDER BY cnt DESC
     LIMIT 50`,
  );

  if (topEntities.rows.length === 0) return;

  let generated = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const row of topEntities.rows) {
    const entityId = row.entity_id as string;

    const existing = await db.execute({
      sql: `SELECT narrative_text, source_event_count, generated_at, staleness_score
            FROM entity_narratives WHERE entity_id = ?`,
      args: [entityId],
    });

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      const staleness = await computeStaleness(
        entityId,
        prev.source_event_count as number,
        prev.generated_at as string,
      );

      await db.execute({
        sql: `UPDATE entity_narratives SET staleness_score = ? WHERE entity_id = ?`,
        args: [staleness, entityId],
      });

      if (staleness <= 0.3) {
        skipped++;
        continue;
      }

      const result = await generateNarrative(entityId);
      if (!result) { skipped++; continue; }

      await db.execute({
        sql: `UPDATE entity_narratives
              SET narrative_text = ?, source_event_count = ?, generated_at = ?, staleness_score = 0
              WHERE entity_id = ?`,
        args: [result.text, result.sourceEventCount, new Date().toISOString(), entityId],
      });
      refreshed++;
      continue;
    }

    const result = await generateNarrative(entityId);
    if (!result) { skipped++; continue; }

    await db.execute({
      sql: `INSERT INTO entity_narratives (entity_id, narrative_text, source_event_count, generated_at, staleness_score)
            VALUES (?, ?, ?, ?, 0)`,
      args: [entityId, result.text, result.sourceEventCount, new Date().toISOString()],
    });
    generated++;
  }

  if (generated > 0 || refreshed > 0) {
    console.log(`[narratives] ${generated} created, ${refreshed} refreshed, ${skipped} unchanged`);
  }
}

export const narrativeWorker = { run };
