// ============================================================
// Agent memory API — delete one fact (tenant-scoped)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentMemory, agent } from '@/lib/agent-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string; memoryId: string }> };

// DELETE — remove one memory fact (scoped to this agent + tenant)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_UPDATE);
    const { id: agentId, memoryId } = await params;

    // Verify the agent belongs to this tenant
    const [agentRow] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, agentId), eq(agent.ownerId, tenantId)))
      .limit(1);
    if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Delete scoped to this agent (memoryId is only valid under it)
    const deleted = await db
      .delete(agentMemory)
      .where(and(eq(agentMemory.id, memoryId), eq(agentMemory.agentId, agentId)))
      .returning({ id: agentMemory.id });
    if (deleted.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
