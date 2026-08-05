// ============================================================
// Users [id] API — update sub-account / delete sub-account
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from 'better-auth/crypto';
import { db } from '@/lib/db';
import { user, role, account, session as sessionTable } from '@/lib/auth-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

// GET — single user (tenant-scoped)
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.USER_READ);
    const { id } = await params;

    const [targetUser] = await db.select().from(user).where(eq(user.id, id)).limit(1);
    if (!targetUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Must belong to this tenant
    const belongsToTenant = targetUser.id === tenantId || targetUser.ownerId === tenantId;
    if (!belongsToTenant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      ownerId: targetUser.ownerId,
      roleId: targetUser.roleId,
      enabled: targetUser.enabled,
      createdAt: targetUser.createdAt.toISOString(),
      updatedAt: targetUser.updatedAt.toISOString()
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT — update a user's name / email / password / role
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requirePermission(PERMISSIONS.USER_UPDATE);
    const { tenantId, session } = ctx;
    const { id: targetId } = await params;
    const body = await request.json();
    const { name, email, password, roleId } = body as {
      name?: string;
      email?: string;
      password?: string;
      roleId?: string;
    };

    const [targetUser] = await db.select().from(user).where(eq(user.id, targetId)).limit(1);
    if (!targetUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Tenant / master guards: master accounts may only be edited by themselves.
    if (targetUser.ownerId === null) {
      if (targetUser.id !== session!.user.id) {
        return NextResponse.json({ error: 'Cannot edit master account' }, { status: 403 });
      }
    } else if (targetUser.ownerId !== tenantId) {
      return NextResponse.json({ error: 'Can only update users in your tenant' }, { status: 403 });
    }

    const updates: { name?: string; email?: string; roleId?: string } = {};

    if (typeof name === 'string' && name.trim()) {
      updates.name = name.trim();
    }

    if (typeof email === 'string' && email.trim()) {
      const cleanEmail = email.trim();
      if (cleanEmail !== targetUser.email) {
        const [dup] = await db.select().from(user).where(eq(user.email, cleanEmail)).limit(1);
        if (dup && dup.id !== targetId) {
          return NextResponse.json(
            { error: 'A user with this email already exists' },
            { status: 409 }
          );
        }
        updates.email = cleanEmail;
      }
    }

    if (roleId && roleId !== targetUser.roleId) {
      // Cannot change your own role
      if (targetId === session!.user.id) {
        return NextResponse.json({ error: 'Cannot change your own role' }, { status: 403 });
      }
      const [targetRole] = await db.select().from(role).where(eq(role.id, roleId)).limit(1);
      if (!targetRole) return NextResponse.json({ error: 'Role not found' }, { status: 400 });
      if (targetRole.ownerId !== null && targetRole.ownerId !== tenantId) {
        return NextResponse.json({ error: 'Role does not belong to this tenant' }, { status: 400 });
      }
      updates.roleId = roleId;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(user).set(updates).where(eq(user.id, targetId));
    }

    // Optional password reset — hashed with better-auth's own hashing so it stays
    // compatible with sign-in. Provider "credential" is better-auth's email/password.
    if (typeof password === 'string' && password.length >= 8) {
      const hash = await hashPassword(password);
      await db
        .update(account)
        .set({ password: hash })
        .where(and(eq(account.userId, targetId), eq(account.providerId, 'credential')));
    }

    return NextResponse.json({ updated: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH — toggle user enabled/disabled status
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requirePermission(PERMISSIONS.USER_ENABLE);
    const { tenantId, session } = ctx;
    const { id: targetId } = await params;
    const body = await request.json();
    const { enabled } = body as { enabled: boolean };

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
    }

    const [targetUser] = await db.select().from(user).where(eq(user.id, targetId)).limit(1);
    if (!targetUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cannot disable yourself
    if (targetId === session!.user.id && !enabled) {
      return NextResponse.json({ error: 'Cannot disable yourself' }, { status: 403 });
    }

    // Must belong to this tenant
    const belongsToTenant = targetUser.id === tenantId || targetUser.ownerId === tenantId;
    if (!belongsToTenant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Cannot disable master account
    if (targetUser.ownerId === null && !enabled) {
      return NextResponse.json({ error: 'Cannot disable the master account' }, { status: 403 });
    }

    await db.update(user).set({ enabled }).where(eq(user.id, targetId));

    // Disabling immediately invalidates all of the target's existing sessions
    // (deletes the session rows → their session cookie no longer resolves).
    if (!enabled) {
      await db.delete(sessionTable).where(eq(sessionTable.userId, targetId));
    }

    return NextResponse.json({ enabled });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — remove sub-account (cannot delete master, cannot delete self)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requirePermission(PERMISSIONS.USER_DELETE);
    const { tenantId, session } = ctx;
    const { id: targetId } = await params;

    // Cannot delete self
    if (targetId === session!.user.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 403 });
    }

    const [targetUser] = await db.select().from(user).where(eq(user.id, targetId)).limit(1);
    if (!targetUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cannot delete master account (ownerId=null => master)
    if (targetUser.ownerId === null) {
      return NextResponse.json({ error: 'Cannot delete the master account' }, { status: 403 });
    }

    // Must belong to this tenant
    if (targetUser.ownerId !== tenantId) {
      return NextResponse.json(
        { error: 'Can only delete sub-accounts in your tenant' },
        { status: 403 }
      );
    }

    await db.delete(user).where(eq(user.id, targetId));

    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
