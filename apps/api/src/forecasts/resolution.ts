import { randomUUID } from 'crypto';
import { db } from '../db/client';
import type { Forecast, QuestionType } from './types';

type ResolutionResult = {
  resolved: number;
  expired: number;
  errors: number;
};

type ResolutionSource = {
  table?: string;
  comparison?: string;
  check?: string;
  series_key?: string;
};

function parseResolutionSource(raw: string): ResolutionSource | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ResolutionSource;
  } catch {
    return null;
  }
}

async function resolveBinary(
  forecast: Forecast,
  source: ResolutionSource,
): Promise<{ value: number; evidence: Record<string, unknown> } | null> {
  if (source.check === 'count_gt_zero') {
    const result = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM event_entities
            WHERE entity_id = ?
            AND event_id IN (SELECT id FROM events WHERE occurred_at > ? AND occurred_at <= ?)`,
      args: [forecast.entity_id, forecast.created_at, forecast.resolves_at],
    });
    const cnt = Number(result.rows[0]?.cnt ?? 0);
    return { value: cnt > 0 ? 1.0 : 0.0, evidence: { count: cnt, check: source.check } };
  }

  return null;
}

async function resolveNumeric(
  forecast: Forecast,
  source: ResolutionSource,
): Promise<{ value: number; evidence: Record<string, unknown> } | null> {
  if (source.table === 'event_counts_daily' && source.series_key) {
    const createdDay = forecast.created_at.slice(0, 10);
    const resolvesDay = forecast.resolves_at.slice(0, 10);
    const result = await db.execute({
      sql: `SELECT SUM(cnt) as total FROM event_counts_daily
            WHERE series_key = ? AND day >= ? AND day <= ?`,
      args: [source.series_key, createdDay, resolvesDay],
    });
    const total = result.rows[0]?.total;
    if (total == null) return null;
    return { value: Number(total), evidence: { total: Number(total), series_key: source.series_key } };
  }

  return null;
}

async function resolveDate(
  forecast: Forecast,
  source: ResolutionSource,
): Promise<{ value: number; evidence: Record<string, unknown> } | null> {
  if (source.check === 'confirmed_at_after_now' && forecast.entity_name) {
    const result = await db.execute({
      sql: `SELECT confirmed_at FROM ontology_concepts
            WHERE label = ? AND confirmed_at > ?`,
      args: [forecast.entity_name, forecast.created_at],
    });
    if (result.rows.length > 0 && result.rows[0].confirmed_at) {
      const ts = new Date(result.rows[0].confirmed_at as string).getTime();
      return { value: ts, evidence: { confirmed_at: result.rows[0].confirmed_at, label: forecast.entity_name } };
    }
    return null;
  }

  return null;
}

const resolvers: Record<QuestionType, (f: Forecast, s: ResolutionSource) => Promise<{ value: number; evidence: Record<string, unknown> } | null>> = {
  binary: resolveBinary,
  numeric: resolveNumeric,
  date: resolveDate,
};

async function resolveOne(forecast: Forecast): Promise<'resolved' | 'expired' | 'error'> {
  const source = parseResolutionSource(
    typeof forecast.resolution_source === 'string'
      ? forecast.resolution_source
      : JSON.stringify(forecast.resolution_source),
  );

  if (!source || (!source.table && !source.check && !source.series_key)) {
    await db.execute({
      sql: `UPDATE forecasts SET status = 'expired' WHERE id = ?`,
      args: [forecast.id],
    });
    console.warn(`[resolution-oracle] expired forecast ${forecast.id} — malformed resolution_source`);
    return 'expired';
  }

  const resolver = resolvers[forecast.question_type];
  if (!resolver) {
    await db.execute({
      sql: `UPDATE forecasts SET status = 'expired' WHERE id = ?`,
      args: [forecast.id],
    });
    console.warn(`[resolution-oracle] expired forecast ${forecast.id} — unknown question_type: ${forecast.question_type}`);
    return 'expired';
  }

  let outcome: { value: number; evidence: Record<string, unknown> } | null;
  try {
    outcome = await resolver(forecast, source);
  } catch (err) {
    await db.execute({
      sql: `UPDATE forecasts SET status = 'expired' WHERE id = ?`,
      args: [forecast.id],
    });
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[resolution-oracle] expired forecast ${forecast.id} — query error: ${msg}`);
    return 'error';
  }

  if (outcome === null) {
    await db.execute({
      sql: `UPDATE forecasts SET status = 'expired' WHERE id = ?`,
      args: [forecast.id],
    });
    console.warn(`[resolution-oracle] expired forecast ${forecast.id} — ambiguous/null result`);
    return 'expired';
  }

  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO forecast_resolutions (id, forecast_id, resolution_method, raw_evidence, resolved_by, resolved_at, workspace_id)
          VALUES (?, ?, 'auto', ?, 'system', ?, ?)`,
    args: [randomUUID(), forecast.id, JSON.stringify(outcome.evidence), now, forecast.workspace_id ?? ''],
  });

  await db.execute({
    sql: `UPDATE forecasts SET status = 'resolved', resolution_value = ?, resolved_at = ? WHERE id = ?`,
    args: [outcome.value, now, forecast.id],
  });

  return 'resolved';
}

export async function resolveMaturedForecasts(workspaceId: string = ''): Promise<ResolutionResult> {
  const now = new Date().toISOString();
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [now];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT * FROM forecasts WHERE resolves_at <= ? AND status = 'open'${wsFilter}`,
    args,
  });

  let resolved = 0;
  let expired = 0;
  let errors = 0;

  for (const row of result.rows) {
    const forecast: Forecast = {
      id: row.id as string,
      question: row.question as string,
      question_type: row.question_type as QuestionType,
      resolution_criteria: row.resolution_criteria as string,
      resolution_source: JSON.parse((row.resolution_source as string) || '{}'),
      base_rate: row.base_rate != null ? Number(row.base_rate) : null,
      entity_id: (row.entity_id as string) ?? null,
      entity_name: (row.entity_name as string) ?? null,
      provider_type: (row.provider_type as string) ?? null,
      source_signal: (row.source_signal as string) ?? null,
      created_at: row.created_at as string,
      resolves_at: row.resolves_at as string,
      resolved_at: (row.resolved_at as string) ?? null,
      resolution_value: row.resolution_value != null ? Number(row.resolution_value) : null,
      status: row.status as Forecast['status'],
      workspace_id: (row.workspace_id as string) ?? '',
    };

    const outcome = await resolveOne(forecast);
    if (outcome === 'resolved') resolved++;
    else if (outcome === 'expired') expired++;
    else errors++;
  }

  return { resolved, expired, errors };
}
