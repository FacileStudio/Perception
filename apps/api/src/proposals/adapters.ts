import { getEffectiveSetting } from '../db/settings';
import type { ActionProposal, ActionType } from './types';

export type WriteAdapter = {
  execute: (proposal: ActionProposal) => Promise<string>;
};

const vikunjaAdapter: WriteAdapter = {
  async execute(proposal) {
    const baseUrl = await getEffectiveSetting('vikunja_api_url');
    const token = await getEffectiveSetting('vikunja_api_token');
    const projectId = proposal.payload.project_id ?? await getEffectiveSetting('vikunja_default_project_id');

    if (!baseUrl || !token || !projectId) {
      throw new Error('Vikunja not configured: missing vikunja_api_url, vikunja_api_token, or project_id');
    }

    const res = await fetch(`${baseUrl}/api/v1/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ title: proposal.title, description: proposal.description }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vikunja API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as { id: number };
    return `${baseUrl}/tasks/${data.id}`;
  },
};

const docusealAdapter: WriteAdapter = {
  async execute(proposal) {
    console.log(`[proposals] docuseal annotation stub for ${proposal.target_entity_id}`);
    return `Annotation noted for contract ${proposal.target_entity_name ?? proposal.target_entity_id ?? 'unknown'} (Docuseal API is read-only for annotations)`;
  },
};

const charlesAdapter: WriteAdapter = {
  async execute(proposal) {
    console.log(`[proposals] charles tag stub for ${proposal.target_entity_id}`);
    return `Tagged ${proposal.target_entity_name ?? proposal.target_entity_id ?? 'unknown'} as at-risk in Charles (stub)`;
  },
};

const adapterMap: Record<ActionType, WriteAdapter> = {
  create_task: vikunjaAdapter,
  annotate_contract: docusealAdapter,
  tag_client: charlesAdapter,
};

export function getAdapter(actionType: ActionType): WriteAdapter | null {
  return adapterMap[actionType] ?? null;
}
