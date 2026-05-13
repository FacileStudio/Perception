import type { Context } from 'hono';
import { auth, type Session } from '../auth';
import { config } from '../config';
import { db } from '../db/client';

export interface WorkspaceContext {
  userId: string;
  userName: string;
  userEmail: string;
  workspaceId: string;
  workspaceSlug: string;
  role: string;
}

const DEV_CONTEXT: WorkspaceContext = {
  userId: 'dev',
  userName: 'Dev User',
  userEmail: 'dev@local',
  workspaceId: 'default',
  workspaceSlug: 'default',
  role: 'owner',
};

export async function getWorkspaceContext(c: Context): Promise<WorkspaceContext | null> {
  if (config.localDevAuthDisabled) return DEV_CONTEXT;

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;

  const wsId = (session.session as any).activeOrganizationId as string | null;
  if (!wsId) {
    const fallback = await getDefaultWorkspace(session.user.id);
    if (!fallback) return null;
    return {
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      workspaceId: fallback.id,
      workspaceSlug: fallback.slug,
      role: fallback.role,
    };
  }

  const member = await db.execute({
    sql: 'SELECT m.role, o.slug FROM member m JOIN organization o ON o.id = m.organizationId WHERE m.userId = ? AND m.organizationId = ?',
    args: [session.user.id, wsId],
  });
  if (member.rows.length === 0) return null;

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    workspaceId: wsId,
    workspaceSlug: member.rows[0].slug as string,
    role: member.rows[0].role as string,
  };
}

async function getDefaultWorkspace(userId: string): Promise<{ id: string; slug: string; role: string } | null> {
  const result = await db.execute({
    sql: 'SELECT m.organizationId, m.role, o.slug FROM member m JOIN organization o ON o.id = m.organizationId WHERE m.userId = ? ORDER BY m.createdAt ASC LIMIT 1',
    args: [userId],
  });
  if (result.rows.length > 0) {
    return {
      id: result.rows[0].organizationId as string,
      slug: result.rows[0].slug as string,
      role: result.rows[0].role as string,
    };
  }

  const defaultOrg = await db.execute({
    sql: "SELECT id, slug FROM organization ORDER BY createdAt ASC LIMIT 1",
    args: [],
  });
  if (defaultOrg.rows.length === 0) return null;

  const orgId = defaultOrg.rows[0].id as string;
  const orgSlug = defaultOrg.rows[0].slug as string;
  await db.execute({
    sql: "INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES (?, ?, ?, 'member', ?)",
    args: [crypto.randomUUID(), userId, orgId, new Date().toISOString()],
  });

  return { id: orgId, slug: orgSlug, role: 'member' };
}

export async function requireWorkspace(c: Context): Promise<WorkspaceContext | null> {
  const ctx = await getWorkspaceContext(c);
  if (!ctx) return null;
  return ctx;
}

export async function requireAdmin(c: Context): Promise<WorkspaceContext | null> {
  const ctx = await getWorkspaceContext(c);
  if (!ctx) return null;
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return null;
  return ctx;
}
