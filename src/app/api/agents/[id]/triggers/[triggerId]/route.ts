// ============================================================
// Agent Triggers [triggerId] API — update / delete (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import cron from 'node-cron';
import { db } from '@/lib/db';
import { agent, agentTrigger } from '@/lib/agent-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string; triggerId: string }> };

function ownedDenied(
  agentRow: { ownerId: string } | undefined,
  tenantId: string
): NextResponse | null {
  if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agentRow.ownerId !== tenantId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// PUT — update a trigger (name / cron / prompt / targetChatId / enabled)
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_TRIGGER_MANAGE);
    const { id, triggerId } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    // Trigger must belong to this agent
    const [row] = await db
      .select()
      .from(agentTrigger)
      .where(and(eq(agentTrigger.id, triggerId), eq(agentTrigger.agentId, id)))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.cron !== undefined) {
      if (!cron.validate(body.cron))
        return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
      updates.cron = body.cron;
    }
    if (body.prompt !== undefined) updates.prompt = body.prompt;
    if (body.targetChatId !== undefined) {
      updates.targetChatId =
        typeof body.targetChatId === 'string' && body.targetChatId.trim()
          ? body.targetChatId.trim()
          : null;
    }
    if (body.enabled !== undefined) updates.enabled = !!body.enabled;

    if (Object.keys(updates).length > 0) {
      await db.update(agentTrigger).set(updates).where(eq(agentTrigger.id, triggerId));
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

// DELETE — remove a trigger
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_TRIGGER_MANAGE);
    const { id, triggerId } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    await db
      .delete(agentTrigger)
      .where(and(eq(agentTrigger.id, triggerId), eq(agentTrigger.agentId, id)));

    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
