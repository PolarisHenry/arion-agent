// ============================================================
// Agent Skills [skillId] API — update / delete (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agent, agentSkill } from '@/lib/agent-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string; skillId: string }> };

function ownedDenied(
  agentRow: { ownerId: string } | undefined,
  tenantId: string
): NextResponse | null {
  if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agentRow.ownerId !== tenantId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// PUT — update a skill (name / description / body / enabled). Full edit.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_SKILL_MANAGE);
    const { id, skillId } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    // Skill must belong to this agent
    const [row] = await db
      .select()
      .from(agentSkill)
      .where(and(eq(agentSkill.id, skillId), eq(agentSkill.agentId, id)))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.body !== undefined) updates.body = body.body;
    if (body.enabled !== undefined) updates.enabled = !!body.enabled;

    if (Object.keys(updates).length > 0) {
      await db
        .update(agentSkill)
        .set(updates)
        .where(and(eq(agentSkill.id, skillId), eq(agentSkill.agentId, id)));
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — remove a skill
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_SKILL_MANAGE);
    const { id, skillId } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    await db.delete(agentSkill).where(and(eq(agentSkill.id, skillId), eq(agentSkill.agentId, id)));

    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
