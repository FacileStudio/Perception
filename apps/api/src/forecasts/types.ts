export type QuestionType = 'binary' | 'numeric' | 'date';
export type ForecastStatus = 'open' | 'resolved' | 'voided' | 'expired';

export type Forecast = {
  id: string;
  question: string;
  question_type: QuestionType;
  resolution_criteria: string;
  resolution_source: Record<string, unknown>;
  base_rate: number | null;
  entity_id: string | null;
  entity_name: string | null;
  provider_type: string | null;
  source_signal: string | null;
  created_at: string;
  resolves_at: string;
  resolved_at: string | null;
  resolution_value: number | null;
  status: ForecastStatus;
  workspace_id?: string;
};

export type CandidateQuestion = {
  question: string;
  question_type: QuestionType;
  resolution_criteria: string;
  resolution_source: Record<string, unknown>;
  entity_id: string | null;
  entity_name: string | null;
  provider_type: string | null;
  source_signal: string;
  resolves_at: string;
};
