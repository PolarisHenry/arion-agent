// ============================================================
// Server-side permission check utility
// Every protected API route calls requirePermission() at the top.
// Returns { session, tenantId } — tenantId is the master account id.
//
// Master accounts (ownerId === null) have all permissions — no role
// lookup needed. Sub-accounts resolve permissions via their assigned
// role in the role table.
// ============================================================

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { role, user as userTable } from '@/lib/auth-schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type { PermissionKey } from './permissions';

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface PermissionContext {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  tenantId: string;
}

export async function requirePermission(key: PermissionKey): Promise<PermissionContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();

  const sessionUser = session.user;
  // Fetch the full user row (better-auth's session.user doesn't include custom columns)
  const [fullUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id))
    .limit(1);
  if (!fullUser) throw new UnauthorizedError();

  // Disabled accounts (toggled in admin UI) are treated as logged out at the
  // API layer, so a stale session from a since-disabled user can't call anything.
  if (!fullUser.enabled) throw new UnauthorizedError();

  // tenantId = master account id
  const tenantId = fullUser.ownerId ?? fullUser.id;

  // Master account — all permissions, no role lookup needed
  if (fullUser.ownerId === null) {
    return { session, tenantId };
  }

  // Sub-account — resolve permissions via assigned role
  const roleId = fullUser.roleId;
  if (!roleId) throw new ForbiddenError('No role assigned');

  const [roleRow] = await db.select().from(role).where(eq(role.id, roleId)).limit(1);
  const perms = roleRow?.permissions ?? [];

  if (!perms.includes(key)) throw new ForbiddenError(`Missing permission: ${key}`);

  return { session, tenantId };
}
