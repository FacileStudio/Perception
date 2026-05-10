export type MemoryEpisode = {
  id: string;
  sessionId: string;
  summary: string;
  entityRefs: string[];
  occurredAt: string;
  retrievalHits: number;
  embeddingStatus: 'pending' | 'ready' | 'error';
};
