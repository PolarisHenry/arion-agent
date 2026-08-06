// ============================================================
// Agents API — list / create (tenant-scoped, encrypted appSecret)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { agent, llmModel } from '@/lib/agent-schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';

async function toAgent(row: typeof agent.$inferSelect) {
  const [lm] = await db
    .select({ name: llmModel.name })
    .from(llmModel)
    .where(eq(llmModel.id, row.llmModelId))
    .limit(1);
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    appId: row.appId,
    appSecretMasked: maskSecret(decryptSecret(row.appSecretCipher)),
    larkCliProfile: row.larkCliProfile,
    platform: row.platform,
    platformConfig: row.platformConfig,
    linkedAgentId: row.linkedAgentId,
    systemPrompt: row.systemPrompt,
    llmModelId: row.llmModelId,
    llmModelName: lm?.name ?? null,
    status: row.status,
    configVersion: row.configVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

// GET — list agents for current tenant
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_READ);
    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 10);
    const search = searchParams.get('search') ?? '';
    // Server-side sort. Whitelist to the columns the table exposes as sortable;
    // anything else (or no param) falls back to createdAt desc (newest first).
    const sortParam = searchParams.get('sort') ?? '';
    const orderParam = searchParams.get('order') ?? 'desc';
    const sortCol = sortParam === 'name' ? agent.name : agent.createdAt;

    const rows = await db
      .select()
      .from(agent)
      .where(eq(agent.ownerId, tenantId))
      .orderBy(orderParam === 'asc' ? asc(sortCol) : desc(sortCol));
    let agents = await Promise.all(rows.map(toAgent));
    if (search) {
      const s = search.toLowerCase();
      agents = agents.filter(
        (a) => a.name.toLowerCase().includes(s) || a.appId.toLowerCase().includes(s)
      );
    }
    const total = agents.length;
    const offset = (page - 1) * limit;
    const paged = limit === 0 ? agents : agents.slice(offset, offset + limit);
    return NextResponse.json({
      success: true,
      total,
      offset,
      limit: limit || total,
      agents: paged
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create an agent
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_CREATE);
    const body = await request.json();
    const { name, appId, appSecret, systemPrompt, llmModelId, status } = body;

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (!appId) return NextResponse.json({ error: 'appId required' }, { status: 400 });
    if (!appSecret) return NextResponse.json({ error: 'appSecret required' }, { status: 400 });
    if (!systemPrompt)
      return NextResponse.json({ error: 'systemPrompt required' }, { status: 400 });
    if (!llmModelId) return NextResponse.json({ error: 'llmModelId required' }, { status: 400 });

    // FK check: llm model must belong to this tenant
    const [lm] = await db
      .select()
      .from(llmModel)
      .where(and(eq(llmModel.id, llmModelId), eq(llmModel.ownerId, tenantId)))
      .limit(1);
    if (!lm) return NextResponse.json({ error: 'Invalid llmModelId' }, { status: 400 });

    const [existing] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.ownerId, tenantId), eq(agent.name, name)))
      .limit(1);
    if (existing)
      return NextResponse.json(
        { error: 'An agent with this name already exists' },
        { status: 409 }
      );

    const id = randomUUID();
    await db.insert(agent).values({
      id,
      ownerId: tenantId,
      name,
      description: body.description ?? null,
      avatar: body.avatar ?? null,
      appId,
      appSecretCipher: encryptSecret(appSecret),
      larkCliProfile: `agent-${id}`,
      systemPrompt,
      llmModelId,
      status: status === 'paused' ? 'paused' : 'active',
      configVersion: 1
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
