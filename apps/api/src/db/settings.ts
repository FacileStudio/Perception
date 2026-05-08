import { db } from './client';
import { config } from '../config';

const DEFAULTS: Record<string, string> = {
  anthropic_api_key: config.anthropicApiKey,
  voyage_api_key: config.voyageApiKey,
  llm_model: config.llmModel,
  embedding_model: config.embeddingModel,
  embedding_dimensions: String(config.embeddingDimensions),
  retention_days: String(config.retentionDays),
  store_raw_payloads: String(config.storeRawPayloads),
  email_body_indexing: String(config.emailBodyIndexing),
};

export async function getEffectiveSetting(key: string): Promise<string> {
  const result = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE key = ?',
    args: [key],
  });
  if (result.rows.length > 0) {
    return result.rows[0].value as string;
  }
  return DEFAULTS[key] ?? '';
}

export async function getAllEffectiveSettings(): Promise<Record<string, string>> {
  const result = await db.execute('SELECT key, value FROM app_settings');
  const dbSettings: Record<string, string> = {};
  for (const row of result.rows) {
    dbSettings[row.key as string] = row.value as string;
  }
  return { ...DEFAULTS, ...dbSettings };
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, new Date().toISOString()],
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM app_settings WHERE key = ?',
    args: [key],
  });
}

export async function getSettingSource(key: string): Promise<'db' | 'env' | 'default'> {
  const result = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE key = ?',
    args: [key],
  });
  if (result.rows.length > 0) return 'db';
  if (DEFAULTS[key] && DEFAULTS[key] !== '' && DEFAULTS[key] !== 'false' && DEFAULTS[key] !== '0') return 'env';
  return 'default';
}
