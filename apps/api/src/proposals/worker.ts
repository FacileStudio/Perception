import { generateProposals, insertProposals } from './generator';

async function run(): Promise<void> {
  const proposals = await generateProposals();
  if (proposals.length === 0) return;

  const inserted = await insertProposals(proposals);
  console.log(`[proposals] generated ${inserted} new proposal(s)`);
}

export const proposalWorker = { run };
