// ============================================================
// Agent logs API — read-only log listing for an agent
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentLog, agent } from '@/lib/agent-schema';
import { eq, and, desc } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

// GET — list logs for a specific agent
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_LOG_READ);
    const { id: agentId } = await params;

    // Verify agent belongs to this tenant
    const [agentRow] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, agentId), eq(agent.ownerId, tenantId)))
      .limit(1);
    if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);

    const rows = await db
      .select()
      .from(agentLog)
      .where(eq(agentLog.agentId, agentId))
      .orderBy(desc(agentLog.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const logs = rows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      type: r.type,
      messageContent: r.messageContent,
      responseContent: r.responseContent,
      toolCalls: r.toolCalls,
      tokensUsed: r.tokensUsed,
      durationMs: r.durationMs,
      status: r.status,
      error: r.error,
      createdAt: r.createdAt.toISOString()
    }));

    // Count total
    const [countRow] = await db.select().from(agentLog).where(eq(agentLog.agentId, agentId));

    return NextResponse.json({
      success: true,
      total: countRow ? rows.length : 0, // approximation for pagination
      offset: (page - 1) * limit,
      limit,
      logs
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
