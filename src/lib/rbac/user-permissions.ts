// ============================================================
// Server-side resolution of the current user + effective permissions.
// Single source of truth shared by landing routes, route guards, and /api/auth/me.
//
// A user is "unauthenticated" here if any of: no session, user row missing,
// or `enabled === false` (disabled accounts behave as logged out everywhere).
// Master accounts (ownerId === null) implicitly hold all permissions.
// ============================================================

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { role, user as userTable } from '@/lib/auth-schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { ALL_PERMISSIONS, type PermissionKey } from './permissions';
import { getFirstAccessiblePath } from './nav-access';

type FullUser = typeof userTable.$inferSelect;

export type ResolvedAuth =
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; fullUser: FullUser; permissions: PermissionKey[] };

export async function resolveServerAuth(): Promise<ResolvedAuth> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { status: 'unauthenticated' };

  const [fullUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);

  // Missing row OR disabled → treat as logged out.
  if (!fullUser || !fullUser.enabled) return { status: 'unauthenticated' };

  let permissions: PermissionKey[];
  if (fullUser.ownerId === null) {
    permissions = [...ALL_PERMISSIONS];
  } else {
    const [roleRow] = await db.select().from(role).where(eq(role.id, fullUser.roleId)).limit(1);
    permissions = (roleRow?.permissions ?? []) as PermissionKey[];
  }

  return { status: 'authenticated', fullUser, permissions };
}

/**
 * The route an authenticated user should land on: their first accessible page,
 * or `/no-access` if they have none. Unauthenticated → `/sign-in`.
 */
export async function resolveLandingPath(): Promise<string> {
  const resolved = await resolveServerAuth();
  if (resolved.status !== 'authenticated') return '/sign-in';
  return getFirstAccessiblePath(resolved.permissions) ?? '/no-access';
}
