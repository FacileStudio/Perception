import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { listEvents, getEventDetail } from '../events/query';
import { deleteEvent } from '../events/mutate';

export const eventsRoutes = new Hono();

eventsRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const limit = Math.min(Number.parseInt(c.req.query('limit') ?? '50', 10), 200);
  const offset = Number.parseInt(c.req.query('offset') ?? '0', 10);

  const { events, total } = await listEvents({
    q: c.req.query('q'),
    providerType: c.req.query('provider_type'),
    entityType: c.req.query('entity_type'),
    quality: c.req.query('quality'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit,
    offset,
  });

  return c.json({ events, total, limit, offset });
});

eventsRoutes.get('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const result = await getEventDetail(c.req.param('id'));
  if (!result) return c.json({ error: 'not_found' }, 404);

  return c.json(result);
});

eventsRoutes.delete('/:id', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const deleted = await deleteEvent(c.req.param('id'));
  if (!deleted) return c.json({ error: 'not_found' }, 404);

  return c.json({ ok: true });
});
