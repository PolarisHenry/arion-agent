// ============================================================
// LLM Models [id] API — get / update / delete (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { llmModel } from '@/lib/agent-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';

type Params = { params: Promise<{ id: string }> };

function assertTenant(row: typeof llmModel.$inferSelect | undefined, tenantId: string) {
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.ownerId !== tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// GET — single model (masked)
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.LLM_MODEL_READ);
    const { id } = await params;
    const [row] = await db.select().from(llmModel).where(eq(llmModel.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;
    return NextResponse.json({
      id: row!.id,
      ownerId: row!.ownerId,
      name: row!.name,
      provider: row!.provider,
      baseUrl: row!.baseUrl,
      apiKeyMasked: maskSecret(decryptSecret(row!.apiKeyCipher)),
      modelName: row!.modelName,
      temperature: row!.temperature,
      maxTokens: row!.maxTokens,
      isActive: row!.isActive,
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString()
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT — update (apiKey re-encrypted only when provided)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.LLM_MODEL_UPDATE);
    const { id } = await params;
    const [row] = await db.select().from(llmModel).where(eq(llmModel.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (body.name !== row!.name) {
        const [dup] = await db
          .select()
          .from(llmModel)
          .where(and(eq(llmModel.ownerId, tenantId), eq(llmModel.name, body.name)))
          .limit(1);
        if (dup)
          return NextResponse.json(
            { error: 'A model with this name already exists' },
            { status: 409 }
          );
      }
      updates.name = body.name;
    }
    if (body.provider !== undefined) updates.provider = body.provider;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.modelName !== undefined) updates.modelName = body.modelName;
    if (body.temperature !== undefined) updates.temperature = body.temperature;
    if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') {
      updates.apiKeyCipher = encryptSecret(body.apiKey);
    }

    await db.update(llmModel).set(updates).where(eq(llmModel.id, id));
    return NextResponse.json({ updated: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.LLM_MODEL_DELETE);
    const { id } = await params;
    const [row] = await db.select().from(llmModel).where(eq(llmModel.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;
    await db.delete(llmModel).where(eq(llmModel.id, id));
    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
