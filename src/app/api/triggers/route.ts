// ============================================================
// Triggers API — list ALL triggers across a tenant's agents
// (for the standalone "Scheduled Tasks" admin page)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentTrigger, agent } from '@/lib/agent-schema';
import { eq } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

// GET — all triggers for this tenant (across agents), joined with agent name
export async function GET(_request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_TRIGGER_MANAGE);
    const rows = await db
      .select({
        id: agentTrigger.id,
        agentId: agentTrigger.agentId,
        agentName: agent.name,
        name: agentTrigger.name,
        cron: agentTrigger.cron,
        prompt: agentTrigger.prompt,
        targetChatId: agentTrigger.targetChatId,
        enabled: agentTrigger.enabled,
        lastRunAt: agentTrigger.lastRunAt,
        createdAt: agentTrigger.createdAt,
        updatedAt: agentTrigger.updatedAt
      })
      .from(agentTrigger)
      .innerJoin(agent, eq(agentTrigger.agentId, agent.id))
      .where(eq(agentTrigger.ownerId, tenantId));

    return NextResponse.json({
      triggers: rows.map((r) => ({
        ...r,
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
