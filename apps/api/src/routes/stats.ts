import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getLatestSnapshots, refreshSnapshots } from '../stats/snapshots';

export const statsRoutes = new Hono();

statsRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  if (c.req.query('refresh') === '1') {
    await refreshSnapshots();
  }

  const snapshots = await getLatestSnapshots();
  return c.json({ snapshots });
});
