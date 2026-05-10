export type StatsSnapshot = {
  id: string;
  kind: string;
  window_start: string;
  window_end: string;
  generated_at: string;
  source_count: number;
  min_sample_met: boolean;
  data: Record<string, unknown>;
};
