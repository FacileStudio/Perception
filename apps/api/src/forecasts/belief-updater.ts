import { randomUUID } from 'crypto';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';
import type { BeliefState, BeliefConfidence } from './belief-types';

const MAX_STEPS = 20;
const MAX_DELTA = 0.3;
const MAX_EVIDENCE_ITEMS = 10;

const SYSTEM_PROMPT = `You are a superforecaster updating a probabilistic belief. Follow this methodology:

1. OUTSIDE VIEW: Start from the base rate. What fraction of similar situations resolve this way?
2. INSIDE VIEW: What specific evidence shifts the probability? Be precise about direction and magnitude.
3. BOTH SIDES: Always consider evidence for AND against. Avoid confirmation bias.
4. GRANULARITY: Use precise probabilities (e.g., 0.73 not 0.7). Small updates are fine — large shifts need strong justification.
5. CALIBRATION: A 70% forecast should come true ~70% of the time. Don't over-anchor on recent events.

Output ONLY valid JSON matching this schema:
{
  "probability": <float 0-1>,
  "confidence": "low" | "medium" | "high",
  "evidence_for": "<concise summary of supporting evidence>",
  "evidence_against": "<concise summary of contradicting evidence>",
  "open_questions": "<what information would most change the forecast>",
  "update_reasoning": "<why probability moved in this direction and by this amount>"
}`;

function rowToBelief(r: Record<string, unknown>): BeliefState {
  return {
    id: r.id as string,
    forecast_id: r.forecast_id as string,
    step: Number(r.step),
    probability: Number(r.probability),
    confidence: r.confidence as BeliefConfidence,
    evidence_for: (r.evidence_for as string) ?? '',
    evidence_against: (r.evidence_against as string) ?? '',
    open_questions: (r.open_questions as string) ?? '',
    update_reasoning: (r.update_reasoning as string) ?? '',
    created_at: r.created_at as string,
  };
}

export async function getLatestBelief(forecastId: string, workspaceId: string = ''): Promise<BeliefState | null> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [forecastId];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT * FROM forecast_beliefs WHERE forecast_id = ?${wsFilter} ORDER BY step DESC LIMIT 1`,
    args,
  });
  if (result.rows.length === 0) return null;
  return rowToBelief(result.rows[0] as Record<string, unknown>);
}

export async function getAllBeliefs(forecastId: string, workspaceId: string = ''): Promise<BeliefState[]> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const args: (string | number | null)[] = [forecastId];
  if (workspaceId) args.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT * FROM forecast_beliefs WHERE forecast_id = ?${wsFilter} ORDER BY step ASC`,
    args,
  });
  return result.rows.map((r) => rowToBelief(r as Record<string, unknown>));
}

async function seedInitialBelief(forecastId: string, baseRate: number | null, workspaceId: string = ''): Promise<BeliefState> {
  const now = new Date().toISOString();
  const belief: BeliefState = {
    id: randomUUID(),
    forecast_id: forecastId,
    step: 0,
    probability: baseRate ?? 0.5,
    confidence: 'low',
    evidence_for: '',
    evidence_against: '',
    open_questions: '',
    update_reasoning: baseRate != null ? `Initialized from base rate ${baseRate}` : 'Maximum entropy prior — no base rate available',
    created_at: now,
  };

  await db.execute({
    sql: `INSERT INTO forecast_beliefs (id, forecast_id, step, probability, confidence, evidence_for, evidence_against, open_questions, update_reasoning, created_at, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [belief.id, belief.forecast_id, belief.step, belief.probability, belief.confidence, belief.evidence_for, belief.evidence_against, belief.open_questions, belief.update_reasoning, belief.created_at, workspaceId],
  });

  return belief;
}

type EvidenceItem = { type: string; summary: string; timestamp: string };

async function getRelatedEntityIds(entityId: string): Promise<string[]> {
  const result = await db.execute({
    sql: `SELECT to_entity_id AS eid FROM entity_relations WHERE from_entity_id = ?
          UNION
          SELECT from_entity_id AS eid FROM entity_relations WHERE to_entity_id = ?`,
    args: [entityId, entityId],
  });
  return result.rows.map((r) => r.eid as string);
}

async function gatherEvidence(
  entityId: string | null,
  providerType: string | null,
  since: string,
  wideSearch: boolean = false,
): Promise<EvidenceItem[]> {
  const evidence: EvidenceItem[] = [];

  if (entityId) {
    const events = await db.execute({
      sql: `SELECT event_type, entity_name, status, created_at FROM events
            WHERE entity_id = ? AND created_at > ?
            ORDER BY created_at DESC LIMIT ?`,
      args: [entityId, since, MAX_EVIDENCE_ITEMS],
    });
    for (const r of events.rows) {
      evidence.push({
        type: 'event',
        summary: `${r.event_type} on ${r.entity_name ?? entityId}${r.status ? ` [${r.status}]` : ''}`,
        timestamp: r.created_at as string,
      });
    }

    const changePoints = await db.execute({
      sql: `SELECT detected_at, pre_mean, post_mean, run_length_probability FROM change_points
            WHERE entity_id = ? AND detected_at > ?
            ORDER BY detected_at DESC LIMIT 5`,
      args: [entityId, since],
    });
    for (const r of changePoints.rows) {
      evidence.push({
        type: 'change_point',
        summary: `Regime shift detected: mean moved from ${Number(r.pre_mean).toFixed(2)} to ${Number(r.post_mean).toFixed(2)} (p=${Number(r.run_length_probability).toFixed(3)})`,
        timestamp: r.detected_at as string,
      });
    }
  }

  if (wideSearch && entityId) {
    const relatedIds = await getRelatedEntityIds(entityId);
    for (const relId of relatedIds.slice(0, 3)) {
      const relEvents = await db.execute({
        sql: `SELECT event_type, entity_name, status, created_at FROM events
              WHERE entity_id = ? AND created_at > ?
              ORDER BY created_at DESC LIMIT 3`,
        args: [relId, since],
      });
      for (const r of relEvents.rows) {
        evidence.push({
          type: 'related_event',
          summary: `${r.event_type} on related entity ${r.entity_name ?? relId}${r.status ? ` [${r.status}]` : ''}`,
          timestamp: r.created_at as string,
        });
      }
    }
  }

  if (entityId || providerType) {
    const causalArgs: (string | number)[] = [];
    let causalWhere = 'WHERE detected_at > ? AND superseded_at IS NULL';
    causalArgs.push(since);

    if (entityId) {
      causalWhere += ' AND (cause_series LIKE ? OR effect_series LIKE ?)';
      causalArgs.push(`%${entityId}%`, `%${entityId}%`);
    }

    const causalLinks = await db.execute({
      sql: `SELECT cause_series, effect_series, lag_days, p_value, direction, detected_at FROM causal_links
            ${causalWhere}
            ORDER BY detected_at DESC LIMIT 5`,
      args: causalArgs,
    });
    for (const r of causalLinks.rows) {
      evidence.push({
        type: 'causal_link',
        summary: `Causal: ${r.cause_series} -> ${r.effect_series} (lag=${r.lag_days}d, p=${Number(r.p_value).toFixed(4)}, ${r.direction})`,
        timestamp: r.detected_at as string,
      });
    }
  }

  evidence.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return evidence.slice(0, MAX_EVIDENCE_ITEMS);
}

function buildUserPrompt(
  belief: BeliefState,
  question: string,
  resolutionCriteria: string,
  evidence: EvidenceItem[],
): string {
  const parts: string[] = [
    `Forecast question: ${question}`,
    `Resolution criteria: ${resolutionCriteria}`,
    `Current belief (step ${belief.step}): probability=${belief.probability}, confidence=${belief.confidence}`,
  ];

  if (belief.evidence_for) parts.push(`Previous evidence for: ${belief.evidence_for}`);
  if (belief.evidence_against) parts.push(`Previous evidence against: ${belief.evidence_against}`);

  if (evidence.length > 0) {
    parts.push('');
    parts.push(`New evidence since last update (${evidence.length} items):`);
    for (const e of evidence) {
      parts.push(`- [${e.type}] ${e.summary} (${e.timestamp})`);
    }
  } else {
    parts.push('');
    parts.push('No new evidence since last update. Re-evaluate with fresh eyes — check for anchoring bias.');
  }

  return parts.join('\n');
}

function clampDelta(current: number, proposed: number): number {
  const delta = proposed - current;
  if (Math.abs(delta) > MAX_DELTA) {
    return current + Math.sign(delta) * MAX_DELTA;
  }
  return proposed;
}

export async function updateBelief(forecastId: string, wideSearch: boolean = false, workspaceId: string = ''): Promise<BeliefState | null> {
  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const fcArgs: (string | number | null)[] = [forecastId];
  if (workspaceId) fcArgs.push(workspaceId);
  const forecast = await db.execute({
    sql: `SELECT * FROM forecasts WHERE id = ? AND status = 'open'${wsFilter}`,
    args: fcArgs,
  });
  if (forecast.rows.length === 0) return null;
  const fc = forecast.rows[0] as Record<string, unknown>;

  let current = await getLatestBelief(forecastId, workspaceId);
  if (!current) {
    current = await seedInitialBelief(forecastId, fc.base_rate != null ? Number(fc.base_rate) : null, workspaceId);
  }

  if (current.step >= MAX_STEPS) return current;

  const apiKey = await getEffectiveSetting('anthropic_api_key', workspaceId);
  if (!apiKey) {
    console.warn('[belief-updater] no anthropic_api_key configured, skipping update');
    return current;
  }

  const evidence = await gatherEvidence(
    (fc.entity_id as string) ?? null,
    (fc.provider_type as string) ?? null,
    current.created_at,
    wideSearch,
  );

  const userPrompt = buildUserPrompt(
    current,
    fc.question as string,
    fc.resolution_criteria as string,
    evidence,
  );

  const anthropic = createAnthropic({ apiKey });
  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    maxTokens: 500,
  });

  const parsed = JSON.parse(text);

  let probability = Number(parsed.probability);
  if (isNaN(probability) || probability < 0 || probability > 1) {
    console.warn(`[belief-updater] invalid probability ${parsed.probability}, skipping`);
    return current;
  }

  probability = clampDelta(current.probability, probability);
  probability = Math.round(probability * 1000) / 1000;

  const confidence = ['low', 'medium', 'high'].includes(parsed.confidence)
    ? (parsed.confidence as BeliefConfidence)
    : current.confidence;

  const now = new Date().toISOString();
  const newBelief: BeliefState = {
    id: randomUUID(),
    forecast_id: forecastId,
    step: current.step + 1,
    probability,
    confidence,
    evidence_for: String(parsed.evidence_for ?? '').slice(0, 2000),
    evidence_against: String(parsed.evidence_against ?? '').slice(0, 2000),
    open_questions: String(parsed.open_questions ?? '').slice(0, 2000),
    update_reasoning: String(parsed.update_reasoning ?? '').slice(0, 2000),
    created_at: now,
  };

  await db.execute({
    sql: `INSERT INTO forecast_beliefs (id, forecast_id, step, probability, confidence, evidence_for, evidence_against, open_questions, update_reasoning, created_at, workspace_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [newBelief.id, newBelief.forecast_id, newBelief.step, newBelief.probability, newBelief.confidence, newBelief.evidence_for, newBelief.evidence_against, newBelief.open_questions, newBelief.update_reasoning, newBelief.created_at, workspaceId],
  });

  return newBelief;
}

export async function hasNewEvidence(forecastId: string, workspaceId: string = ''): Promise<boolean> {
  const latest = await getLatestBelief(forecastId, workspaceId);
  if (!latest) return true;

  const wsFilter = workspaceId ? ' AND workspace_id = ?' : '';
  const fcArgs: (string | number | null)[] = [forecastId];
  if (workspaceId) fcArgs.push(workspaceId);
  const forecast = await db.execute({
    sql: `SELECT entity_id FROM forecasts WHERE id = ?${wsFilter}`,
    args: fcArgs,
  });
  if (forecast.rows.length === 0) return false;
  const entityId = forecast.rows[0].entity_id as string | null;
  if (!entityId) return false;

  const evArgs: (string | number | null)[] = [entityId, latest.created_at];
  if (workspaceId) evArgs.push(workspaceId);
  const result = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM events WHERE entity_id = ? AND created_at > ?${wsFilter}`,
    args: evArgs,
  });
  return Number(result.rows[0].cnt) > 0;
}
