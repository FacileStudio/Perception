import { randomUUID } from 'node:crypto';
import { log } from '../lib/logger';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';
import { runAllEvaluators, type AnomalyAlert } from './evaluators';
import { forEachWorkspace } from '../db/workspaces';

async function isDuplicate(alert: AnomalyAlert, workspaceId: string): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const result = await db.execute({
    sql: `SELECT id FROM notifications
          WHERE type = ? AND title = ? AND created_at > ? AND workspace_id = ?
          LIMIT 1`,
    args: [alert.type, alert.title, oneDayAgo, workspaceId],
  });
  return result.rows.length > 0;
}

async function insertNotification(alert: AnomalyAlert, workspaceId: string): Promise<string> {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO notifications (id, type, severity, title, message, entity_id, entity_name, metadata_json, created_at, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      alert.type,
      alert.severity,
      alert.title,
      alert.message,
      alert.entity_id ?? null,
      alert.entity_name ?? null,
      JSON.stringify(alert.metadata),
      new Date().toISOString(),
      workspaceId,
    ],
  });
  return id;
}

async function fireWebhook(alerts: AnomalyAlert[], workspaceId: string): Promise<void> {
  const url = await getEffectiveSetting('notification_webhook_url', workspaceId);
  if (!url) return;

  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) return;
  } catch {
    return;
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'perception',
        event: 'digest',
        count: alerts.length,
        alerts: alerts.map(a => ({
          type: a.type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          entity_name: a.entity_name ?? null,
          metadata: a.metadata,
        })),
        generated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    log.error('webhook delivery failed', { tag: 'notifications', error: err instanceof Error ? err.message : String(err) });
  }
}

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const alerts = await runAllEvaluators(workspaceId);
    if (alerts.length === 0) return;

    const newAlerts: AnomalyAlert[] = [];
    for (const alert of alerts) {
      if (await isDuplicate(alert, workspaceId)) continue;
      await insertNotification(alert, workspaceId);
      newAlerts.push(alert);
    }

    if (newAlerts.length > 0) {
      await fireWebhook(newAlerts, workspaceId);
      log.info('generated alerts', { tag: 'notifications', count: newAlerts.length, workspaceId });
    }
  });
}

export const notificationWorker = { run };
