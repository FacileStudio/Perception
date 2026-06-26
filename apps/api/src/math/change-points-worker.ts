import { randomUUID } from 'crypto';
import { log } from '../lib/logger';
import { db } from '../db/client';
import { initBocpd, updateBocpd, type BocpdState } from './bocpd';
import { forEachWorkspace } from '../db/workspaces';

const CHANGE_POINT_THRESHOLD = 0.5;

type EntitySeries = {
  entityId: string;
  interArrivalTimes: number[];
};

async function loadEntitySeries(workspaceId: string): Promise<EntitySeries[]> {
  const result = await db.execute({
    sql: `SELECT ee.entity_id, ev.occurred_at
     FROM event_entities ee
     JOIN events ev ON ev.id = ee.event_id
     WHERE ev.occurred_at > datetime('now', '-90 days') AND ev.workspace_id = ?
     ORDER BY ee.entity_id, ev.occurred_at ASC`,
    args: [workspaceId],
  });

  const grouped = new Map<string, string[]>();
  for (const row of result.rows) {
    const id = row.entity_id as string;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(row.occurred_at as string);
  }

  const series: EntitySeries[] = [];
  for (const [entityId, timestamps] of grouped) {
    if (timestamps.length < 10) continue;

    const interArrivalTimes: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const diff = (new Date(timestamps[i]).getTime() - new Date(timestamps[i - 1]).getTime()) / 3600000;
      interArrivalTimes.push(diff);
    }
    series.push({ entityId, interArrivalTimes });
  }

  return series;
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const allSeries = await loadEntitySeries(workspaceId);
    if (allSeries.length === 0) return;

    let detected = 0;

    for (const { entityId, interArrivalTimes } of allSeries) {
      const mean = interArrivalTimes.reduce((a, b) => a + b, 0) / interArrivalTimes.length;
      const variance = interArrivalTimes.reduce((a, v) => a + (v - mean) ** 2, 0) / interArrivalTimes.length;

      const state: BocpdState = initBocpd(mean, Math.max(variance, 1));
      let lastChangeIdx = -1;
      let lastCpProb = 0;
      let preMean = mean;
      let postMean = mean;

      for (let i = 0; i < interArrivalTimes.length; i++) {
        const result = updateBocpd(state, interArrivalTimes[i]);
        if (result.changePointProbability > CHANGE_POINT_THRESHOLD && i > 5) {
          lastChangeIdx = i;
          lastCpProb = result.changePointProbability;
          preMean = result.preMean;
          postMean = result.postMean;
        }
      }

      if (lastChangeIdx < 0) continue;

      const existing = await db.execute({
        sql: `SELECT id FROM change_points
              WHERE entity_id = ? AND detected_at > datetime('now', '-7 days') AND workspace_id = ?
              LIMIT 1`,
        args: [entityId, workspaceId],
      });
      if (existing.rows.length > 0) continue;

      await db.execute({
        sql: `INSERT INTO change_points (id, entity_id, provider_type, detected_at, run_length_probability, pre_mean, post_mean, workspace_id)
              VALUES (?, ?, '', ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          entityId,
          new Date().toISOString(),
          lastCpProb,
          preMean,
          postMean,
          workspaceId,
        ],
      });
      detected++;
    }

    if (detected > 0) {
      log.info('detected regime changes', { tag: 'change-points', detected, workspaceId });
    }
  });
}

export const changePointWorker = { run };
