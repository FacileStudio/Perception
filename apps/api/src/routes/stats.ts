import { Hono } from 'hono';
import { requireSession } from '../security/session';
import { getLatestSnapshotGeneratedAt, getLatestSnapshots, refreshSnapshots } from '../stats/snapshots';

export const statsRoutes = new Hono();

const STATS_STALE_MS = 60 * 60 * 1000;

statsRoutes.get('/', async (c) => {
  const authed = await requireSession(c);
  if (!authed) return c.json({ error: 'unauthorized' }, 401);

  const forceRefresh = c.req.query('refresh') === '1';
  const latestGeneratedAt = await getLatestSnapshotGeneratedAt();
  const shouldBootstrap = latestGeneratedAt === null;
  const isStale = latestGeneratedAt !== null && Date.now() - new Date(latestGeneratedAt).getTime() > STATS_STALE_MS;

  if (forceRefresh || shouldBootstrap || isStale) {
    await refreshSnapshots();
  }

  const snapshots = await getLatestSnapshots();
  return c.json({ snapshots });
});
