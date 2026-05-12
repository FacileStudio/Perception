export type ForecastInterval = {
  id: string;
  forecast_id: string;
  belief_step: number;
  lower_bound: number;
  upper_bound: number;
  coverage_target: number;
  nonconformity_score: number | null;
};

export type ConformalState = {
  calibration_scores: number[];
  coverage_target: number;
  empirical_coverage: number;
  alpha_t: number;
};
