import { db } from './client';

export async function getActiveWorkspaceIds(): Promise<string[]> {
  const result = await db.execute('SELECT id FROM organization ORDER BY createdAt ASC');
  return result.rows.map(r => r.id as string);
}

export async function getDefaultWorkspaceId(): Promise<string> {
  const setting = await db.execute("SELECT value FROM app_settings WHERE key = 'default_workspace_id'");
  if (setting.rows.length > 0) return setting.rows[0].value as string;

  const first = await db.execute('SELECT id FROM organization ORDER BY createdAt ASC LIMIT 1');
  if (first.rows.length > 0) return first.rows[0].id as string;

  return 'default';
}

export async function forEachWorkspace(fn: (workspaceId: string) => Promise<void>): Promise<void> {
  const ids = await getActiveWorkspaceIds();
  for (const id of ids) {
    await fn(id);
  }
}
