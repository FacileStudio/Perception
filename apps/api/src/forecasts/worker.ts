import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { generateCandidateQuestions } from './generator';
import { filterByQuality } from './quality-gate';
import { computeBaseRate } from './base-rate';

const MAX_PER_RUN = 10;

async function expireStale(): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.execute({
    sql: `UPDATE forecasts SET status = 'expired' WHERE status = 'open' AND resolves_at < ?`,
    args: [now],
  });
  return result.rowsAffected;
}

async function run(): Promise<void> {
  const expired = await expireStale();
  if (expired > 0) {
    console.log(`[forecasts] expired ${expired} stale forecast(s)`);
  }

  const candidates = await generateCandidateQuestions();
  if (candidates.length === 0) return;

  const passed = await filterByQuality(candidates);
  const toInsert = passed.slice(0, MAX_PER_RUN);

  let inserted = 0;
  for (const candidate of toInsert) {
    const baseRate = await computeBaseRate(candidate);
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO forecasts (id, question, question_type, resolution_criteria, resolution_source, base_rate, entity_id, entity_name, provider_type, source_signal, created_at, resolves_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      args: [
        randomUUID(),
        candidate.question,
        candidate.question_type,
        candidate.resolution_criteria,
        JSON.stringify(candidate.resolution_source),
        baseRate,
        candidate.entity_id,
        candidate.entity_name,
        candidate.provider_type,
        candidate.source_signal,
        now,
        candidate.resolves_at,
      ],
    });
    inserted++;
  }

  if (inserted > 0) {
    console.log(`[forecasts] generated ${inserted} new forecast(s) from ${candidates.length} candidate(s)`);
  }
}

export const forecastWorker = { run };
