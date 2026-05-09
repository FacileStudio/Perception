export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}
