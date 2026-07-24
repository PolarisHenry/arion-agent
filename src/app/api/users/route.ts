// ============================================================
// Users API — tenant-scoped (master + sub-accounts)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user, role } from '@/lib/auth-schema';
import { eq } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { randomUUID } from 'crypto';

// GET — list users belonging to the current tenant
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.USER_READ);

    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 10);
    const search = searchParams.get('search') ?? '';

    // List sub-accounts only. The master account is the tenant root and not
    // manageable from this list, so it is excluded.
    const rows = await db.select().from(user).where(eq(user.ownerId, tenantId));

    let users = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      ownerId: u.ownerId,
      roleId: u.roleId,
      enabled: u.enabled,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString()
    }));

    if (search) {
      const s = search.toLowerCase();
      users = users.filter(
        (u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
      );
    }

    const total = users.length;
    const offset = (page - 1) * limit;

    return NextResponse.json({
      success: true,
      time: new Date().toISOString(),
      message: 'Users fetched',
      total_users: total,
      offset,
      limit,
      users: users.slice(offset, offset + limit)
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create sub-account (two-step: signUpEmail → override ownerId/roleId)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePermission(PERMISSIONS.USER_CREATE);
    const { tenantId } = ctx;

    const body = await request.json();
    const { email, name, password, roleId } = body;

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 });
    if (!roleId) return NextResponse.json({ error: 'Role required' }, { status: 400 });

    // Validate that roleId belongs to this tenant or is the system Owner role
    const [targetRole] = await db.select().from(role).where(eq(role.id, roleId)).limit(1);
    if (!targetRole) return NextResponse.json({ error: 'Role not found' }, { status: 400 });
    if (targetRole.ownerId !== null && targetRole.ownerId !== tenantId) {
      return NextResponse.json({ error: 'Role does not belong to this tenant' }, { status: 400 });
    }

    // Check for existing user with this email
    const existing = await db.select().from(user).where(eq(user.email, email));
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    // Step 1: signUpEmail — hook sets ownerId=null, roleId='owner'
    const signUpResult = await auth.api.signUpEmail({
      body: { name: name || email, email, password }
    });

    const newUserId = signUpResult.user.id;

    // Step 2: override to sub-account
    await db.update(user).set({ ownerId: tenantId, roleId }).where(eq(user.id, newUserId));

    return NextResponse.json({ success: true, id: newUserId }, { status: 201 });
  } catch (e: any) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
