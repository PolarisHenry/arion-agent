// ============================================================
// Roles API — list / create roles for current tenant
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { role } from '@/lib/auth-schema';
import { eq, and, or, like } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS, ALL_PERMISSIONS } from '@/lib/rbac/permissions';
import { randomUUID } from 'crypto';

// GET — list roles for current tenant (paginated)
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.ROLE_READ);

    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 10);
    const search = searchParams.get('search') ?? '';

    // Only this tenant's custom roles
    const rows = await db.select().from(role).where(eq(role.ownerId, tenantId));

    let roles = rows.map((r) => ({
      id: r.id,
      ownerId: r.ownerId,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));

    if (search) {
      const s = search.toLowerCase();
      roles = roles.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          (r.description && r.description.toLowerCase().includes(s))
      );
    }

    const total = roles.length;
    const offset = (page - 1) * limit;

    // limit=0 means "return all" (used by role selector dropdowns)
    const pagedRoles = limit === 0 ? roles : roles.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      total_roles: total,
      offset,
      limit: limit || total,
      roles: pagedRoles
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create a custom role for this tenant
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.ROLE_CREATE);

    const body = await request.json();
    const { name, description, permissions } = body;

    if (!name) return NextResponse.json({ error: 'Role name required' }, { status: 400 });
    if (!permissions || !Array.isArray(permissions)) {
      return NextResponse.json({ error: 'permissions array required' }, { status: 400 });
    }

    // Validate permissions are valid keys
    const validKeys = new Set(ALL_PERMISSIONS);
    for (const p of permissions) {
      if (!validKeys.has(p)) {
        return NextResponse.json({ error: `Invalid permission: ${p}` }, { status: 400 });
      }
    }

    // Check for duplicate role name in this tenant
    const [existing] = await db
      .select()
      .from(role)
      .where(and(eq(role.ownerId, tenantId), eq(role.name, name)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 });
    }

    const id = randomUUID();
    await db.insert(role).values({
      id,
      ownerId: tenantId,
      name,
      description: description || '',
      permissions
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
