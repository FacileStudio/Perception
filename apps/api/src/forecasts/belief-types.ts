export type BeliefConfidence = 'low' | 'medium' | 'high';

export type BeliefState = {
  id: string;
  forecast_id: string;
  step: number;
  probability: number;
  confidence: BeliefConfidence;
  evidence_for: string;
  evidence_against: string;
  open_questions: string;
  update_reasoning: string;
  created_at: string;
};
