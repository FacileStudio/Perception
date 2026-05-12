import { db } from '../db/client';
import type { CandidateQuestion } from './types';

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function isDuplicate(entityId: string | null, sourceSignal: string, questionType: string, workspaceId: string = ''): Promise<boolean> {
  if (!entityId) return false;
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [entityId, sourceSignal, questionType];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT id FROM forecasts
          WHERE entity_id = ? AND source_signal = ? AND question_type = ? AND status = 'open'${wsFilter}
          LIMIT 1`,
    args,
  });
  return result.rows.length > 0;
}

async function fromChangePoints(workspaceId: string = ''): Promise<CandidateQuestion[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const wsFilter = workspaceId ? ' AND cp.workspace_id = ?' : '';
  const cpArgs: (string | number | null)[] = [sevenDaysAgo];
  if (workspaceId) cpArgs.push(workspaceId);
  const rows = await db.execute({
    sql: `SELECT cp.entity_id, e.canonical_name, cp.provider_type
          FROM change_points cp
          LEFT JOIN entities e ON e.id = cp.entity_id
          WHERE cp.detected_at > ?${wsFilter}`,
    args: cpArgs,
  });

  const candidates: CandidateQuestion[] = [];
  for (const r of rows.rows) {
    const entityId = r.entity_id as string;
    const entityName = (r.canonical_name as string) ?? entityId;
    if (await isDuplicate(entityId, 'change_point', 'binary', workspaceId)) continue;
    candidates.push({
      question: `Will ${entityName} return to pre-change activity levels within 14 days?`,
      question_type: 'binary',
      resolution_criteria: 'Event count in the 14-day window after the change point compared to the pre-change mean.',
      resolution_source: { table: 'event_entities', comparison: 'pre_mean_vs_post_count' },
      entity_id: entityId,
      entity_name: entityName,
      provider_type: (r.provider_type as string) || null,
      source_signal: 'change_point',
      resolves_at: daysFromNow(14),
    });
  }
  return candidates;
}

async function fromCausalLinks(workspaceId: string = ''): Promise<CandidateQuestion[]> {
  const wsFilter = workspaceId ? ' AND cl.workspace_id = ?' : '';
  const clArgs: (string | number | null)[] = [];
  if (workspaceId) clArgs.push(workspaceId);
  const rows = await db.execute({
    sql: `SELECT cl.effect_series, cl.cause_series, cl.p_value
     FROM causal_links cl
     WHERE cl.p_value < 0.01 AND cl.superseded_at IS NULL${wsFilter}`,
    args: clArgs,
  });

  const candidates: CandidateQuestion[] = [];
  for (const r of rows.rows) {
    const effectSeries = r.effect_series as string;
    if (await isDuplicate(effectSeries, 'causal_link', 'numeric', workspaceId)) continue;
    candidates.push({
      question: `How many events will ${effectSeries} generate in the next 7 days?`,
      question_type: 'numeric',
      resolution_criteria: 'SQL count of events matching the effect series key over the 7-day window.',
      resolution_source: { table: 'event_counts_daily', series_key: effectSeries },
      entity_id: effectSeries,
      entity_name: effectSeries,
      provider_type: null,
      source_signal: 'causal_link',
      resolves_at: daysFromNow(7),
    });
  }
  return candidates;
}

async function fromAnomalyNotifications(workspaceId: string = ''): Promise<CandidateQuestion[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const wsFilter = workspaceId ? ' AND n.workspace_id = ?' : '';
  const nArgs: (string | number | null)[] = [sevenDaysAgo];
  if (workspaceId) nArgs.push(workspaceId);
  const rows = await db.execute({
    sql: `SELECT n.entity_id, n.entity_name, n.type
          FROM notifications n
          WHERE n.created_at > ? AND (n.type LIKE '%spike%' OR n.type LIKE '%absence%')${wsFilter}`,
    args: nArgs,
  });

  const candidates: CandidateQuestion[] = [];
  for (const r of rows.rows) {
    const entityId = r.entity_id as string | null;
    const entityName = (r.entity_name as string) ?? entityId ?? 'unknown entity';
    if (await isDuplicate(entityId, 'anomaly_notification', 'binary', workspaceId)) continue;
    candidates.push({
      question: `Will ${entityName} generate activity in the next 14 days?`,
      question_type: 'binary',
      resolution_criteria: 'Event count > 0 for the entity over the 14-day window.',
      resolution_source: { table: 'event_entities', check: 'count_gt_zero' },
      entity_id: entityId,
      entity_name: entityName,
      provider_type: null,
      source_signal: 'anomaly_notification',
      resolves_at: daysFromNow(14),
    });
  }
  return candidates;
}

async function fromConceptDriftAlerts(workspaceId: string = ''): Promise<CandidateQuestion[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const wsFilter = workspaceId ? ' AND cda.workspace_id = ?' : '';
  const cdaArgs: (string | number | null)[] = [sevenDaysAgo];
  if (workspaceId) cdaArgs.push(workspaceId);
  const rows = await db.execute({
    sql: `SELECT cda.provider_type, cda.field_name
          FROM concept_drift_alerts cda
          WHERE cda.detected_at > ?${wsFilter}`,
    args: cdaArgs,
  });

  const candidates: CandidateQuestion[] = [];
  for (const r of rows.rows) {
    const providerType = r.provider_type as string;
    if (await isDuplicate(providerType, 'concept_drift', 'date', workspaceId)) continue;
    candidates.push({
      question: `When will the next schema confirmation occur for ${providerType}?`,
      question_type: 'date',
      resolution_criteria: 'Schema re-confirmed via schema inference worker for the provider type.',
      resolution_source: { table: 'ontology_concepts', check: 'confirmed_at_after_now' },
      entity_id: providerType,
      entity_name: providerType,
      provider_type: providerType,
      source_signal: 'concept_drift',
      resolves_at: daysFromNow(30),
    });
  }
  return candidates;
}

export async function generateCandidateQuestions(workspaceId: string = ''): Promise<CandidateQuestion[]> {
  const [changePoints, causalLinks, anomalies, drifts] = await Promise.all([
    fromChangePoints(workspaceId),
    fromCausalLinks(workspaceId),
    fromAnomalyNotifications(workspaceId),
    fromConceptDriftAlerts(workspaceId),
  ]);
  return [...changePoints, ...causalLinks, ...anomalies, ...drifts];
}
