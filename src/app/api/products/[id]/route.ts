// ============================================================
// Products [id] API — tenant-scoped via ownerId
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { product } from '@/lib/auth-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

// GET — single product
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.PRODUCT_READ);
    const { id } = await params;

    const [result] = await db
      .select()
      .from(product)
      .where(and(eq(product.id, id), eq(product.ownerId, tenantId)))
      .limit(1);

    if (!result) return NextResponse.json({ success: false }, { status: 404 });
    return NextResponse.json({ success: true, product: result });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT — update product
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.PRODUCT_UPDATE);
    const { id } = await params;
    const body = await request.json();

    const [existing] = await db
      .select()
      .from(product)
      .where(and(eq(product.id, id), eq(product.ownerId, tenantId)))
      .limit(1);

    if (!existing) return NextResponse.json({ success: false }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.price !== undefined) updates.price = body.price;
    if (body.description !== undefined) updates.description = body.description;

    await db.update(product).set(updates).where(eq(product.id, id));

    return NextResponse.json({ success: true, product: { ...existing, ...updates } });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — delete product
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.PRODUCT_DELETE);
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(product)
      .where(and(eq(product.id, id), eq(product.ownerId, tenantId)))
      .limit(1);

    if (!existing) return NextResponse.json({ success: false }, { status: 404 });

    await db.delete(product).where(eq(product.id, id));

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
