import { describe, expect, test } from 'bun:test';
import { extractQueryTerms, inferQueryCapabilities, normalizeLabel } from '../src/ontology/query';

describe('ontology query helpers', () => {
  test('normalizes generated labels to stable ids', () => {
    expect(normalizeLabel('Invoice billed to Organization')).toBe('invoice_billed_to_organization');
    expect(normalizeLabel('client/company')).toBe('client_company');
  });

  test('extracts useful terms without question filler', () => {
    const terms = extractQueryTerms('What happened with Acme contracts recently?');
    expect(terms).toContain('acme');
    expect(terms).toContain('contracts');
    expect(terms).not.toContain('what');
    expect(terms).not.toContain('recently');
  });

  test('maps domain words to primitive capabilities', () => {
    const capabilities = inferQueryCapabilities('show unpaid client invoices and contracts');
    expect(capabilities).toContain('commercial_account');
    expect(capabilities).toContain('financial_record');
    expect(capabilities).toContain('document');
  });
});
