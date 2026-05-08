import { db } from './client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export async function runMigrations(): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);

  const alreadyApplied = await db.execute('SELECT name FROM _migrations');
  const applied = new Set(alreadyApplied.rows.map(r => r.name as string));

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: '001_initial_schema',
      sql: readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf-8'),
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const statements = migration.sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try {
        await db.execute(stmt);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('libsql_vector_idx') || msg.includes('F32_BLOB') || msg.includes('near "WHERE"')) {
          console.warn(`[migrations] skipped unsupported statement: ${stmt.slice(0, 80)}`);
          continue;
        }
        throw e;
      }
    }
    await db.execute({
      sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      args: [migration.name, new Date().toISOString()],
    });
    console.log(`[migrations] applied: ${migration.name}`);
  }
}
