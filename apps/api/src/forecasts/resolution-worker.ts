import { log } from '../lib/logger';
import { resolveMaturedForecasts } from './resolution';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const { resolved, expired, errors } = await resolveMaturedForecasts(workspaceId);
    if (resolved > 0 || expired > 0) {
      log.info('resolution complete', { tag: 'resolution-oracle', resolved, expired, errors, workspaceId });
    }
  });
}

export const resolutionWorker = { run };
