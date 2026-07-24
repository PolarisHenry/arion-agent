// ============================================================
// Agent Triggers API — list / create (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { db } from '@/lib/db';
import { agent, agentTrigger } from '@/lib/agent-schema';
import { eq } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

function ownedDenied(
  agentRow: { ownerId: string } | undefined,
  tenantId: string
): NextResponse | null {
  if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agentRow.ownerId !== tenantId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// GET — list triggers for an agent
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_TRIGGER_MANAGE);
    const { id } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    const rows = await db.select().from(agentTrigger).where(eq(agentTrigger.agentId, id));

    return NextResponse.json({
      triggers: rows.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        name: r.name,
        cron: r.cron,
        prompt: r.prompt,
        targetChatId: r.targetChatId,
        enabled: r.enabled,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
      }))
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create a trigger
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_TRIGGER_MANAGE);
    const { id } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    const body = await request.json();
    const { name, cron: cronExpr, prompt, targetChatId, enabled } = body;

    if (!name || typeof name !== 'string')
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    if (!cronExpr || typeof cronExpr !== 'string')
      return NextResponse.json({ error: 'cron required' }, { status: 400 });
    if (!cron.validate(cronExpr))
      return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
    if (!prompt || typeof prompt !== 'string')
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });

    const triggerId = randomUUID();
    await db.insert(agentTrigger).values({
      id: triggerId,
      ownerId: tenantId,
      agentId: id,
      name,
      cron: cronExpr,
      prompt,
      targetChatId:
        typeof targetChatId === 'string' && targetChatId.trim() ? targetChatId.trim() : null,
      enabled: enabled !== false
    });

    return NextResponse.json({ success: true, id: triggerId }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
