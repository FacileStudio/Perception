import { resolveMaturedForecasts } from './resolution';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const { resolved, expired, errors } = await resolveMaturedForecasts(workspaceId);
    if (resolved > 0 || expired > 0) {
      console.log(`[resolution-oracle] resolved=${resolved} expired=${expired} errors=${errors} (workspace ${workspaceId})`);
    }
  });
}

export const resolutionWorker = { run };
