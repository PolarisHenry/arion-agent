// ============================================================
// Roles [id] API — get / update / delete a role
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { role, user } from '@/lib/auth-schema';
import { eq } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS, ALL_PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

// GET — single role
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.ROLE_READ);
    const { id } = await params;

    const [result] = await db.select().from(role).where(eq(role.id, id)).limit(1);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Must belong to this tenant
    if (result.ownerId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      id: result.id,
      ownerId: result.ownerId,
      name: result.name,
      description: result.description,
      permissions: result.permissions,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString()
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT — update role
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.ROLE_UPDATE);
    const { id } = await params;

    const [targetRole] = await db.select().from(role).where(eq(role.id, id)).limit(1);
    if (!targetRole) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Must belong to this tenant
    if (targetRole.ownerId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.permissions !== undefined) {
      if (!Array.isArray(body.permissions)) {
        return NextResponse.json({ error: 'permissions must be an array' }, { status: 400 });
      }
      const validKeys = new Set(ALL_PERMISSIONS);
      for (const p of body.permissions) {
        if (!validKeys.has(p)) {
          return NextResponse.json({ error: `Invalid permission: ${p}` }, { status: 400 });
        }
      }
      updates.permissions = body.permissions;
    }

    await db.update(role).set(updates).where(eq(role.id, id));

    return NextResponse.json({ updated: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — delete role (must have no users assigned)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.ROLE_DELETE);
    const { id } = await params;

    const [targetRole] = await db.select().from(role).where(eq(role.id, id)).limit(1);
    if (!targetRole) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Must belong to this tenant
    if (targetRole.ownerId !== tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check for users assigned to this role
    const usersWithRole = await db.select({ id: user.id }).from(user).where(eq(user.roleId, id));
    if (usersWithRole.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete role: it is assigned to one or more users' },
        { status: 409 }
      );
    }

    await db.delete(role).where(eq(role.id, id));

    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
