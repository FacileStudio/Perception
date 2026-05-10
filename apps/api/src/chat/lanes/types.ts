import type { EventRow } from '../../events/types';
import type { StatsSnapshot } from '../../stats/types';

export type RetrievalSource = 'vector' | 'fts' | 'sql' | 'stats' | 'entity' | 'concept' | 'graph';
export type TemporalPeriod = 'current' | 'previous';

export type TemporalComparison = {
  dimension: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number | null;
};

export type AnnotatedStatsSnapshot = StatsSnapshot & { period?: TemporalPeriod };

export type ScoredEvent<S extends RetrievalSource = RetrievalSource> = EventRow & {
  score: number;
  source: S;
  concepts?: string[];
  entity_names?: string[];
  period?: TemporalPeriod;
};

export type RankedEvent = ScoredEvent & { lanes: RetrievalSource[] };

export type RetrievalResult = {
  events: RankedEvent[];
  stats: AnnotatedStatsSnapshot[];
  comparisons: TemporalComparison[];
};

export type ContextConfidence = {
  score: number;
  verdict: 'correct' | 'ambiguous' | 'incorrect';
  details: {
    qualityScore: number;
    scoreSpread: number;
    laneDiversity: number;
    entityCoverage: number;
    eventCount: number;
  };
};
