export type ActionType = 'create_task' | 'tag_client' | 'annotate_contract';

export type ProposalStatus = 'proposed' | 'approved' | 'executed' | 'dismissed' | 'failed';

export type ActionProposal = {
  id: string;
  action_type: ActionType;
  target_provider: string;
  target_entity_id: string | null;
  target_entity_name: string | null;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  confidence: number;
  status: ProposalStatus;
  proposed_at: string;
  resolved_at: string | null;
  executed_result: string | null;
};
