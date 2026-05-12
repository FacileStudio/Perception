import { resolveMaturedForecasts } from './resolution';

async function run(): Promise<void> {
  const { resolved, expired, errors } = await resolveMaturedForecasts();
  if (resolved > 0 || expired > 0) {
    console.log(`[resolution-oracle] resolved=${resolved} expired=${expired} errors=${errors}`);
  }
}

export const resolutionWorker = { run };
