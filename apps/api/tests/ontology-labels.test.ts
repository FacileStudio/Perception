import { describe, expect, test } from 'bun:test';
import { normalizeLabel } from '../src/ontology/query';

describe('ontology query helpers', () => {
  test('normalizes generated labels to stable ids', () => {
    expect(normalizeLabel('Invoice billed to Organization')).toBe('invoice_billed_to_organization');
    expect(normalizeLabel('client/company')).toBe('client_company');
  });
});
