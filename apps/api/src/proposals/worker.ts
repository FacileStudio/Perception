import { log } from '../lib/logger';
import { generateProposals, insertProposals } from './generator';
import { forEachWorkspace } from '../db/workspaces';

async function run(): Promise<void> {
  await forEachWorkspace(async (workspaceId) => {
    const proposals = await generateProposals(workspaceId);
    if (proposals.length === 0) return;

    const inserted = await insertProposals(proposals, workspaceId);
    log.info('generated proposals', { tag: 'proposals', inserted, workspaceId });
  });
}

export const proposalWorker = { run };
