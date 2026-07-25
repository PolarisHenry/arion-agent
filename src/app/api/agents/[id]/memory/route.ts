// ============================================================
// Agent memory API — list (tenant-scoped, read-only)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentMemory, agent } from '@/lib/agent-schema';
import { eq, and, desc } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

// GET — list memory facts for an agent (most-recently-updated first)
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_READ);
    const { id: agentId } = await params;

    // Verify the agent belongs to this tenant
    const [agentRow] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, agentId), eq(agent.ownerId, tenantId)))
      .limit(1);
    if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rows = await db
      .select()
      .from(agentMemory)
      .where(eq(agentMemory.agentId, agentId))
      .orderBy(desc(agentMemory.updatedAt));

    return NextResponse.json({
      success: true,
      memory: rows.map((r) => ({
        id: r.id,
        key: r.key,
        value: r.value,
        label: r.label,
        category: r.category,
        note: r.note,
        importance: r.importance,
        expiresAt: r.expiresAt?.toISOString() ?? null,
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
