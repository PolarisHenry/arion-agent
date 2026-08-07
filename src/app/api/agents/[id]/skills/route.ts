// ============================================================
// Agent Skills API — list / create (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { agent, agentSkill } from '@/lib/agent-schema';
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

// GET — list ALL skills for an agent (enabled AND disabled, so admins can
// re-enable disabled ones).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_SKILL_MANAGE);
    const { id } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    const rows = await db.select().from(agentSkill).where(eq(agentSkill.agentId, id));

    return NextResponse.json({
      skills: rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        agentId: r.agentId,
        name: r.name,
        description: r.description,
        body: r.body,
        scope: r.scope,
        provenance: r.provenance,
        sourceChatId: r.sourceChatId,
        enabled: r.enabled,
        platforms: r.platforms,
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

// POST — create a manual skill (provenance 'manual', no source chat)
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_SKILL_MANAGE);
    const { id } = await params;

    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);
    const denied = ownedDenied(agentRow, tenantId);
    if (denied) return denied;

    const body = await request.json();
    const { name, description, enabled } = body;
    const skillBody = body.body;

    if (!name || typeof name !== 'string')
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    if (!description || typeof description !== 'string')
      return NextResponse.json({ error: 'description required' }, { status: 400 });
    if (!skillBody || typeof skillBody !== 'string')
      return NextResponse.json({ error: 'body required' }, { status: 400 });

    const skillId = randomUUID();
    await db.insert(agentSkill).values({
      id: skillId,
      ownerId: tenantId,
      agentId: id,
      name,
      description,
      body: skillBody,
      scope: 'agent',
      provenance: 'manual',
      sourceChatId: null,
      enabled: enabled !== false
    });

    return NextResponse.json({ success: true, id: skillId }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
