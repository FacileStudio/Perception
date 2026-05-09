import { describe, expect, test } from 'bun:test';
import { buildQueryPlan } from '../src/chat/planner';

describe('chat planner', () => {
  test('returns a valid full-mode plan shape', async () => {
    const plan = await buildQueryPlan('what happened recently?');
    expect(plan).toHaveProperty('retrievalMode');
    expect(plan).toHaveProperty('providerFilters');
    expect(plan).toHaveProperty('queryTerms');
    expect(plan).toHaveProperty('requiresRetrieval');
    expect(['full', 'history', 'light']).toContain(plan.retrievalMode);
    expect(Array.isArray(plan.providerFilters)).toBe(true);
    expect(Array.isArray(plan.queryTerms)).toBe(true);
  });
});
