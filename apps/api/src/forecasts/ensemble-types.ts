export type StrategyType = 'base_rate' | 'causal' | 'pattern' | 'llm_belief' | 'human';

export type ForecastStrategy = {
  id: string;
  name: string;
  description: string;
  strategy_type: StrategyType;
  is_active: boolean;
  brier_score: number | null;
  brier_count: number;
  log_weight: number;
  created_at: string;
};

export type StrategyForecast = {
  id: string;
  forecast_id: string;
  strategy_id: string;
  probability: number;
  created_at: string;
};

export type StrategyScore = {
  strategy_id: string;
  strategy_name: string;
  strategy_type: StrategyType;
  brier_score: number | null;
  forecast_count: number;
  weight: number;
  is_active: boolean;
};
