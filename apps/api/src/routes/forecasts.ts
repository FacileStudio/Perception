import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { requireSession } from '../security/session';
import { db } from '../db/client';
import type { Forecast } from '../forecasts/types';
import { getAllBeliefs } from '../forecasts/belief-updater';

export const forecastRoutes = new Hono();

function rowToForecast(r: Record<string, unknown>): Forecast {
  return {
    id: r.id as string,
    question: r.question as string,
    question_type: r.question_type as Forecast['question_type'],
    resolution_criteria: r.resolution_criteria as string,
    resolution_source: JSON.parse((r.resolution_source as string) || '{}'),
    base_rate: r.base_rate != null ? Number(r.base_rate) : null,
    entity_id: (r.entity_id as string) ?? null,
    entity_name: (r.entity_name as string) ?? null,
    provider_type: (r.provider_type as string) ?? null,
    source_signal: (r.source_signal as string) ?? null,
    created_at: r.created_at as string,
    resolves_at: r.resolves_at as string,
    resolved_at: (r.resolved_at as string) ?? null,
    resolution_value: r.resolution_value != null ? Number(r.resolution_value) : null,
    status: r.status as Forecast['status'],
  };
}

forecastRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const status = c.req.query('status');
  const whereClause = status ? 'WHERE status = ?' : '';
  const args = status ? [status] : [];

  const result = await db.execute({
    sql: `SELECT * FROM forecasts ${whereClause} ORDER BY created_at DESC LIMIT 50`,
    args,
  });

  return c.json({ forecasts: result.rows.map((r) => rowToForecast(r as Record<string, unknown>)) });
});

forecastRoutes.get('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({ sql: 'SELECT * FROM forecasts WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  return c.json({ forecast: rowToForecast(result.rows[0] as Record<string, unknown>) });
});

forecastRoutes.post('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json<{
    question: string;
    question_type: string;
    resolution_criteria: string;
    resolves_at: string;
  }>();

  if (!body.question || !body.question_type || !body.resolution_criteria || !body.resolves_at) {
    return c.json({ error: 'missing_fields' }, 400);
  }

  if (!['binary', 'numeric', 'date'].includes(body.question_type)) {
    return c.json({ error: 'invalid_question_type' }, 400);
  }

  const parsedDate = new Date(body.resolves_at);
  if (isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
    return c.json({ error: 'resolves_at_must_be_future' }, 400);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO forecasts (id, question, question_type, resolution_criteria, resolution_source, created_at, resolves_at, status)
          VALUES (?, ?, ?, ?, '{}', ?, ?, 'open')`,
    args: [id, body.question, body.question_type, body.resolution_criteria, now, body.resolves_at],
  });

  const result = await db.execute({ sql: 'SELECT * FROM forecasts WHERE id = ?', args: [id] });
  return c.json({ forecast: rowToForecast(result.rows[0] as Record<string, unknown>) }, 201);
});

forecastRoutes.patch('/:id/resolve', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const body = await c.req.json<{ resolution_value?: number; void?: boolean }>();
  const now = new Date().toISOString();

  if (body.void) {
    await db.execute({ sql: `UPDATE forecasts SET status = 'voided' WHERE id = ?`, args: [id] });
    await db.execute({
      sql: `INSERT INTO forecast_resolutions (id, forecast_id, resolution_method, raw_evidence, resolved_by, resolved_at)
            VALUES (?, ?, 'voided', '{}', 'user', ?)`,
      args: [randomUUID(), id, now],
    });
  } else {
    await db.execute({
      sql: `UPDATE forecasts SET status = 'resolved', resolution_value = ?, resolved_at = ? WHERE id = ? AND status = 'open'`,
      args: [body.resolution_value ?? null, now, id],
    });
    await db.execute({
      sql: `INSERT INTO forecast_resolutions (id, forecast_id, resolution_method, raw_evidence, resolved_by, resolved_at)
            VALUES (?, ?, 'manual', ?, 'user', ?)`,
      args: [randomUUID(), id, JSON.stringify({ resolution_value: body.resolution_value ?? null }), now],
    });
  }

  const result = await db.execute({ sql: 'SELECT * FROM forecasts WHERE id = ?', args: [id] });
  if (result.rows.length === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ forecast: rowToForecast(result.rows[0] as Record<string, unknown>) });
});

forecastRoutes.get('/:id/resolution', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const result = await db.execute({
    sql: `SELECT * FROM forecast_resolutions WHERE forecast_id = ? ORDER BY resolved_at DESC LIMIT 1`,
    args: [id],
  });

  if (result.rows.length === 0) return c.json({ error: 'no_resolution' }, 404);

  const r = result.rows[0];
  return c.json({
    resolution: {
      id: r.id as string,
      forecast_id: r.forecast_id as string,
      resolution_method: r.resolution_method as string,
      raw_evidence: JSON.parse((r.raw_evidence as string) || '{}'),
      resolved_by: r.resolved_by as string,
      resolved_at: r.resolved_at as string,
    },
  });
});

forecastRoutes.get('/:id/beliefs', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const forecast = await db.execute({ sql: 'SELECT id FROM forecasts WHERE id = ?', args: [id] });
  if (forecast.rows.length === 0) return c.json({ error: 'not_found' }, 404);

  const beliefs = await getAllBeliefs(id);
  return c.json({ beliefs });
});

forecastRoutes.patch('/:id/extend', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const body = await c.req.json<{ resolves_at: string }>();

  if (!body.resolves_at) return c.json({ error: 'missing_resolves_at' }, 400);

  const parsedDate = new Date(body.resolves_at);
  if (isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
    return c.json({ error: 'resolves_at_must_be_future' }, 400);
  }

  const result = await db.execute({
    sql: `UPDATE forecasts SET resolves_at = ? WHERE id = ? AND status = 'open'`,
    args: [body.resolves_at, id],
  });

  if (result.rowsAffected === 0) return c.json({ error: 'not_found_or_not_open' }, 404);

  const updated = await db.execute({ sql: 'SELECT * FROM forecasts WHERE id = ?', args: [id] });
  return c.json({ forecast: rowToForecast(updated.rows[0] as Record<string, unknown>) });
});

forecastRoutes.delete('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  await db.execute({ sql: `UPDATE forecasts SET status = 'voided' WHERE id = ?`, args: [id] });
  return c.json({ ok: true });
});
