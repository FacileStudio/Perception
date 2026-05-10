import { randomUUID } from 'node:crypto';
import { db } from '../db/client';
import { getEffectiveSetting } from '../db/settings';

type WorkerDef = {
  name: string;
  description: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type WorkerState = {
  name: string;
  description: string;
  intervalMs: number;
  status: 'idle' | 'running';
  lastRun: { started_at: string; finished_at: string; duration_ms: number; status: 'success' | 'error'; error: string | null } | null;
  totalRuns: number;
  totalErrors: number;
};

const workers = new Map<string, WorkerDef>();
const states = new Map<string, { status: 'idle' | 'running'; totalRuns: number; totalErrors: number }>();

export function registerWorker(def: WorkerDef): void {
  workers.set(def.name, def);
  states.set(def.name, { status: 'idle', totalRuns: 0, totalErrors: 0 });
}

async function recordRun(
  workerName: string,
  startedAt: string,
  status: 'success' | 'error',
  durationMs: number,
  error: string | null,
): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO worker_runs (id, worker_name, status, started_at, finished_at, duration_ms, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), workerName, status, startedAt, new Date().toISOString(), durationMs, error],
    });
    await db.execute({
      sql: `DELETE FROM worker_runs WHERE worker_name = ? AND id NOT IN (
              SELECT id FROM worker_runs WHERE worker_name = ? ORDER BY started_at DESC LIMIT 50
            )`,
      args: [workerName, workerName],
    });
  } catch {
  }
}

export async function executeWorker(name: string): Promise<void> {
  const def = workers.get(name);
  if (!def) throw new Error(`Unknown worker: ${name}`);

  const state = states.get(name)!;
  if (state.status === 'running') return;

  state.status = 'running';
  const startedAt = new Date().toISOString();
  const start = Date.now();

  try {
    await def.run();
    const durationMs = Date.now() - start;
    state.totalRuns++;
    state.status = 'idle';
    await recordRun(name, startedAt, 'success', durationMs, null);
  } catch (err) {
    const durationMs = Date.now() - start;
    state.totalRuns++;
    state.totalErrors++;
    state.status = 'idle';
    const msg = err instanceof Error ? err.message : String(err);
    await recordRun(name, startedAt, 'error', durationMs, msg);
    throw err;
  }
}

export async function areWorkersPaused(): Promise<boolean> {
  const val = await getEffectiveSetting('workers_paused');
  return val === 'true';
}

export function scheduleWorker(name: string, delayMs?: number): void {
  const def = workers.get(name);
  if (!def) return;

  setInterval(async () => {
    if (await areWorkersPaused()) return;
    executeWorker(name).catch(console.error);
  }, def.intervalMs);
  if (delayMs !== undefined) {
    setTimeout(async () => {
      if (await areWorkersPaused()) return;
      executeWorker(name).catch(console.error);
    }, delayMs);
  }
}

export async function getWorkerStatuses(): Promise<WorkerState[]> {
  const result: WorkerState[] = [];

  for (const [name, def] of workers) {
    const state = states.get(name)!;

    let lastRun: WorkerState['lastRun'] = null;
    try {
      const row = await db.execute({
        sql: `SELECT started_at, finished_at, duration_ms, status, error
              FROM worker_runs WHERE worker_name = ? ORDER BY started_at DESC LIMIT 1`,
        args: [name],
      });
      if (row.rows.length > 0) {
        const r = row.rows[0];
        lastRun = {
          started_at: r.started_at as string,
          finished_at: r.finished_at as string,
          duration_ms: r.duration_ms as number,
          status: r.status as 'success' | 'error',
          error: r.error as string | null,
        };
      }
    } catch {
    }

    result.push({
      name,
      description: def.description,
      intervalMs: def.intervalMs,
      status: state.status,
      lastRun,
      totalRuns: state.totalRuns,
      totalErrors: state.totalErrors,
    });
  }

  return result;
}

export async function getWorkerHistory(name: string, limit = 20): Promise<Array<{
  started_at: string;
  finished_at: string;
  duration_ms: number;
  status: string;
  error: string | null;
}>> {
  const result = await db.execute({
    sql: `SELECT started_at, finished_at, duration_ms, status, error
          FROM worker_runs WHERE worker_name = ? ORDER BY started_at DESC LIMIT ?`,
    args: [name, limit],
  });
  return result.rows.map((r) => ({
    started_at: r.started_at as string,
    finished_at: r.finished_at as string,
    duration_ms: r.duration_ms as number,
    status: r.status as string,
    error: r.error as string | null,
  }));
}
