export type CalibrationSnapshot = {
  id: string;
  computed_at: string;
  bin_edges: number[];
  bin_counts: number[];
  bin_actuals: number[];
  brier_score: number;
  log_score: number;
  resolution_score: number;
  reliability_score: number;
  sharpness_score: number;
  domain_scores: Record<string, { brier: number; count: number }>;
  forecast_count: number;
};
