import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { auth } from '../auth';
import { config } from '../config';
import { db } from '../db/client';
import { getSession } from './session';

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

  let userId: string;
  let userName: string;
  let userEmail: string;
  let activeOrgId: string | null = null;

  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (session?.user) {
    userId = session.user.id;
    userName = session.user.name;
    userEmail = session.user.email;
    activeOrgId = getCookie(c, 'perception_workspace')
      ?? (session.session as any).activeOrganizationId as string | null;
  } else {
    const legacy = await getSession(c);
    if (!legacy) return null;

    const userRow = await db.execute({
      sql: 'SELECT id, email, name FROM users WHERE id = ?',
      args: [legacy.userId],
    });
    if (userRow.rows.length === 0) return null;

    const email = userRow.rows[0].email as string;
    const name = userRow.rows[0].name as string | null;

    const baUser = await ensureBetterAuthUser(email, name);
    userId = baUser.id;
    userName = baUser.name;
    userEmail = baUser.email;
    activeOrgId = getCookie(c, 'perception_workspace') ?? null;
  }

  if (activeOrgId) {
    const member = await db.execute({
      sql: 'SELECT m.role, o.slug FROM member m JOIN organization o ON o.id = m.organizationId WHERE m.userId = ? AND m.organizationId = ?',
      args: [userId, activeOrgId],
    });
    if (member.rows.length > 0) {
      return {
        userId,
        userName,
        userEmail,
        workspaceId: activeOrgId,
        workspaceSlug: member.rows[0].slug as string,
        role: member.rows[0].role as string,
      };
    }
  }

  const fallback = await getDefaultWorkspace(userId);
  if (!fallback) return null;
  return {
    userId,
    userName,
    userEmail,
    workspaceId: fallback.id,
    workspaceSlug: fallback.slug,
    role: fallback.role,
  };
}

async function ensureBetterAuthUser(email: string, name: string | null): Promise<{ id: string; name: string; email: string }> {
  const existing = await db.execute({
    sql: 'SELECT id, name, email FROM user WHERE email = ?',
    args: [email],
  });
  if (existing.rows.length > 0) {
    return {
      id: existing.rows[0].id as string,
      name: (existing.rows[0].name as string) ?? email,
      email: existing.rows[0].email as string,
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: 'INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, name ?? email, email, 0, now, now],
  });
  return { id, name: name ?? email, email };
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
