// ============================================================
// Agents [id] API — get / update / delete (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agent, llmModel } from '@/lib/agent-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';

type Params = { params: Promise<{ id: string }> };

function assertTenant(row: typeof agent.$inferSelect | undefined, tenantId: string) {
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.ownerId !== tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// GET — single agent (masked)
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_READ);
    const { id } = await params;
    const [row] = await db.select().from(agent).where(eq(agent.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;
    const [lm] = await db
      .select({ name: llmModel.name })
      .from(llmModel)
      .where(eq(llmModel.id, row!.llmModelId))
      .limit(1);
    return NextResponse.json({
      id: row!.id,
      ownerId: row!.ownerId,
      name: row!.name,
      description: row!.description,
      avatar: row!.avatar,
      appId: row!.appId,
      appSecretMasked: maskSecret(decryptSecret(row!.appSecretCipher)),
      larkCliProfile: row!.larkCliProfile,
      platform: row!.platform,
      platformConfig: row!.platformConfig,
      linkedAgentId: row!.linkedAgentId,
      systemPrompt: row!.systemPrompt,
      llmModelId: row!.llmModelId,
      llmModelName: lm?.name ?? null,
      status: row!.status,
      configVersion: row!.configVersion,
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

// PUT — update (bump configVersion so worker hot-reloads; re-encrypt secret only when provided)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_UPDATE);
    const { id } = await params;
    const [row] = await db.select().from(agent).where(eq(agent.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (body.name !== row!.name) {
        const [dup] = await db
          .select()
          .from(agent)
          .where(and(eq(agent.ownerId, tenantId), eq(agent.name, body.name)))
          .limit(1);
        if (dup)
          return NextResponse.json(
            { error: 'An agent with this name already exists' },
            { status: 409 }
          );
      }
      updates.name = body.name;
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.avatar !== undefined) updates.avatar = body.avatar;
    if (body.appId !== undefined) updates.appId = body.appId;
    if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
    if (body.status !== undefined) updates.status = body.status;
    if (body.llmModelId !== undefined) {
      const [lm] = await db
        .select()
        .from(llmModel)
        .where(and(eq(llmModel.id, body.llmModelId), eq(llmModel.ownerId, tenantId)))
        .limit(1);
      if (!lm) return NextResponse.json({ error: 'Invalid llmModelId' }, { status: 400 });
      updates.llmModelId = body.llmModelId;
    }
    if (typeof body.appSecret === 'string' && body.appSecret.trim() !== '') {
      updates.appSecretCipher = encryptSecret(body.appSecret);
    }

    // bump configVersion so a running worker can hot-reload this agent
    updates.configVersion = (row!.configVersion ?? 0) + 1;

    await db.update(agent).set(updates).where(eq(agent.id, id));
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
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_DELETE);
    const { id } = await params;
    const [row] = await db.select().from(agent).where(eq(agent.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;
    await db.delete(agent).where(eq(agent.id, id));
    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH — toggle agent status (active / paused)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_ENABLE);
    const { id } = await params;
    const [row] = await db.select().from(agent).where(eq(agent.id, id)).limit(1);
    const denied = assertTenant(row, tenantId);
    if (denied) return denied;

    const body = await request.json();
    const { status } = body as { status: string };
    if (status !== 'active' && status !== 'paused') {
      return NextResponse.json({ error: 'status must be "active" or "paused"' }, { status: 400 });
    }

    await db
      .update(agent)
      .set({ status, configVersion: (row!.configVersion ?? 0) + 1 })
      .where(eq(agent.id, id));
    return NextResponse.json({ status });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
