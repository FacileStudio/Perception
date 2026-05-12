import { db } from '../db/client';
import { updateBelief, hasNewEvidence, getLatestBelief } from './belief-updater';

const MAX_PER_RUN = 10;
const DELAY_BETWEEN_CALLS_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const openForecasts = await db.execute({
    sql: `SELECT id FROM forecasts WHERE status = 'open' ORDER BY created_at ASC LIMIT ?`,
    args: [MAX_PER_RUN],
  });

  if (openForecasts.rows.length === 0) return;

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of openForecasts.rows) {
    const forecastId = row.id as string;

    try {
      const needsUpdate = await hasNewEvidence(forecastId);
      if (!needsUpdate) {
        skipped++;
        continue;
      }

      const latest = await getLatestBelief(forecastId);
      const wideSearch = !!latest && latest.confidence === 'low' && latest.step >= 3;

      await updateBelief(forecastId, wideSearch);
      updated++;

      if (updated < MAX_PER_RUN) {
        await sleep(DELAY_BETWEEN_CALLS_MS);
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[belief-worker] failed to update forecast ${forecastId}: ${msg}`);
    }
  }

  if (updated > 0 || errors > 0) {
    console.log(`[belief-worker] updated=${updated} skipped=${skipped} errors=${errors}`);
  }
}

export const beliefWorker = { run };
