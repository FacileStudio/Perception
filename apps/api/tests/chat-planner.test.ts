import { describe, expect, test } from 'bun:test';
import { buildQueryPlan } from '../src/chat/planner';

describe('chat planner retrieval modes', () => {
  test('uses light mode for short reactions', () => {
    const plan = buildQueryPlan('ok insane');
    expect(plan.retrievalMode).toBe('light');
    expect(plan.requiresRetrieval).toBe(false);
  });

  test('uses history mode for short referential follow-ups', () => {
    const plan = buildQueryPlan('why?');
    expect(plan.retrievalMode).toBe('history');
    expect(plan.requiresRetrieval).toBe(false);
  });

  test('uses full retrieval for explicit data requests', () => {
    const plan = buildQueryPlan('what happened recently on dokploy?');
    expect(plan.retrievalMode).toBe('full');
    expect(plan.requiresRetrieval).toBe(true);
    expect(plan.prefersRecency).toBe(true);
    expect(plan.providerFilters).toContain('dokploy');
  });
});
