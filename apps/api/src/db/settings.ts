import { db } from './client';

const DEFAULTS: Record<string, string> = {
  llm_model: 'claude-sonnet-4-6',
  embedding_model: 'voyage-4-lite',
  embedding_dimensions: '1024',
  retention_days: '365',
  store_raw_payloads: 'false',
  email_body_indexing: 'false',
  workers_paused: 'false',
};

async function getWorkspaceOverride(key: string, workspaceId: string): Promise<string | null> {
  try {
    const result = await db.execute({
      sql: 'SELECT metadata FROM organization WHERE id = ?',
      args: [workspaceId],
    });
    if (result.rows.length === 0) return null;
    const raw = result.rows[0].metadata as string | null;
    if (!raw) return null;
    const meta = JSON.parse(raw) as Record<string, string>;
    return meta[key] ?? null;
  } catch {
    return null;
  }
}

export async function getEffectiveSetting(key: string, workspaceId: string = ''): Promise<string> {
  if (workspaceId) {
    const wsOverride = await getWorkspaceOverride(key, workspaceId);
    if (wsOverride !== null && wsOverride !== '') return wsOverride;
  }

  const result = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE key = ?',
    args: [key],
  });
  if (result.rows.length > 0) {
    return result.rows[0].value as string;
  }
  return DEFAULTS[key] ?? '';
}

export async function getAllEffectiveSettings(workspaceId: string = ''): Promise<Record<string, string>> {
  const result = await db.execute('SELECT key, value FROM app_settings');
  const dbSettings: Record<string, string> = {};
  for (const row of result.rows) {
    dbSettings[row.key as string] = row.value as string;
  }
  const merged = { ...DEFAULTS, ...dbSettings };

  if (workspaceId) {
    try {
      const orgResult = await db.execute({
        sql: 'SELECT metadata FROM organization WHERE id = ?',
        args: [workspaceId],
      });
      if (orgResult.rows.length > 0) {
        const raw = orgResult.rows[0].metadata as string | null;
        if (raw) {
          const meta = JSON.parse(raw) as Record<string, string>;
          for (const [k, v] of Object.entries(meta)) {
            if (v !== '') merged[k] = v;
          }
        }
      }
    } catch {}
  }

  return merged;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, new Date().toISOString()],
  });
}

export async function setWorkspaceSetting(workspaceId: string, key: string, value: string | null): Promise<void> {
  const orgResult = await db.execute({
    sql: 'SELECT metadata FROM organization WHERE id = ?',
    args: [workspaceId],
  });
  if (orgResult.rows.length === 0) return;

  const raw = orgResult.rows[0].metadata as string | null;
  const meta: Record<string, string> = raw ? JSON.parse(raw) : {};

  if (value === null || value === '') {
    delete meta[key];
  } else {
    meta[key] = value;
  }

  await db.execute({
    sql: 'UPDATE organization SET metadata = ? WHERE id = ?',
    args: [JSON.stringify(meta), workspaceId],
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM app_settings WHERE key = ?',
    args: [key],
  });
}

export async function getSettingSource(key: string, workspaceId: string = ''): Promise<'workspace' | 'db' | 'env' | 'default'> {
  if (workspaceId) {
    const wsOverride = await getWorkspaceOverride(key, workspaceId);
    if (wsOverride !== null && wsOverride !== '') return 'workspace';
  }

  const result = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE key = ?',
    args: [key],
  });
  if (result.rows.length > 0) return 'db';
  if (DEFAULTS[key] && DEFAULTS[key] !== '' && DEFAULTS[key] !== 'false' && DEFAULTS[key] !== '0') return 'env';
  return 'default';
}
