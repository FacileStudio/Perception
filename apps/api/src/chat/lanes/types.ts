import type { EventRow } from '../../events/types';
import type { StatsSnapshot } from '../../stats/types';
import type { CommunitySummary } from './community';
import type { SqlQueryResult } from './text-to-sql';
import type { EntityNarrative } from '../../narratives/retrieve';

export type RetrievalSource = 'vector' | 'fts' | 'sql' | 'stats' | 'entity' | 'concept' | 'graph' | 'community' | 'text_to_sql';
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
  communitySummaries: CommunitySummary[];
  sqlResults: SqlQueryResult[];
  narratives: EntityNarrative[];
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
