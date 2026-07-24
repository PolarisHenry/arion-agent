// ============================================================
// Products API — tenant-scoped via ownerId
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { product } from '@/lib/auth-schema';
import { eq } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { randomUUID } from 'crypto';

// GET — list products for current tenant
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.PRODUCT_READ);

    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 10);
    const search = searchParams.get('search') ?? '';
    const category = searchParams.get('categories') ?? '';

    let rows = await db.select().from(product).where(eq(product.ownerId, tenantId));

    if (search) {
      rows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (category) {
      rows = rows.filter((r) => r.category === category);
    }

    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = rows.length;
    const offset = (page - 1) * limit;

    return NextResponse.json({
      success: true,
      time: new Date().toISOString(),
      message: 'Products fetched',
      total_products: total,
      offset,
      limit,
      products: rows.slice(offset, offset + limit)
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create product
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.PRODUCT_CREATE);

    const body = await request.json();
    const { name, category, price, description } = body;

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const id = randomUUID();
    await db.insert(product).values({
      id,
      ownerId: tenantId,
      name,
      category: category || '',
      price: price || 0,
      description: description || ''
    });

    return NextResponse.json({ id, name }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
