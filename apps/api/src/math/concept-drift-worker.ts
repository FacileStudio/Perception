import { randomUUID } from 'crypto';
import { log } from '../lib/logger';
import { db } from '../db/client';
import { detectCategoricalDrift } from './adwin';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const providers = await db.execute({
      sql: `SELECT DISTINCT provider_type FROM events WHERE occurred_at > datetime('now', '-90 days') AND workspace_id = ?`,
      args: [workspaceId],
    });

    if (providers.rows.length === 0) return;

    let alertCount = 0;

    for (const row of providers.rows) {
      const providerType = row.provider_type as string;

      const [oldWindow, newWindow] = await Promise.all([
        db.execute({
          sql: `SELECT event_type, COUNT(*) AS cnt FROM events
                WHERE provider_type = ? AND occurred_at BETWEEN datetime('now', '-60 days') AND datetime('now', '-30 days') AND workspace_id = ?
                GROUP BY event_type`,
          args: [providerType, workspaceId],
        }),
        db.execute({
          sql: `SELECT event_type, COUNT(*) AS cnt FROM events
                WHERE provider_type = ? AND occurred_at > datetime('now', '-30 days') AND workspace_id = ?
                GROUP BY event_type`,
          args: [providerType, workspaceId],
        }),
      ]);

      const oldDist: Record<string, number> = {};
      const newDist: Record<string, number> = {};
      for (const r of oldWindow.rows) oldDist[r.event_type as string] = Number(r.cnt);
      for (const r of newWindow.rows) newDist[r.event_type as string] = Number(r.cnt);

      const result = detectCategoricalDrift(oldDist, newDist);

      if (!result.drifted) continue;

      const existing = await db.execute({
        sql: `SELECT id FROM concept_drift_alerts
              WHERE provider_type = ? AND detected_at > datetime('now', '-7 days') AND workspace_id = ?
              LIMIT 1`,
        args: [providerType, workspaceId],
      });
      if (existing.rows.length > 0) continue;

      await db.execute({
        sql: `INSERT INTO concept_drift_alerts (id, provider_type, field_name, detected_at, old_distribution, new_distribution, drift_score, workspace_id)
              VALUES (?, ?, 'event_type', ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          providerType,
          new Date().toISOString(),
          JSON.stringify(oldDist),
          JSON.stringify(newDist),
          result.driftScore,
          workspaceId,
        ],
      });

      await db.execute({
        sql: `UPDATE provider_schemas SET confirmed_at = NULL WHERE provider_type = ? AND workspace_id = ?`,
        args: [providerType, workspaceId],
      });

      alertCount++;
    }

    if (alertCount > 0) {
      log.info('drift alerts generated', { tag: 'concept-drift', alertCount, workspaceId });
    }
  });
}

export const conceptDriftWorker = { run };
