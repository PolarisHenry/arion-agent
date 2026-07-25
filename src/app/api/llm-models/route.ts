// ============================================================
// LLM Models API — list / create (tenant-scoped, encrypted apiKey)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { llmModel } from '@/lib/agent-schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';

const VALID_PROVIDERS = new Set(['deepseek', 'openai', 'qwen', 'kimi', 'custom']);

function toModel(row: typeof llmModel.$inferSelect) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKeyMasked: maskSecret(decryptSecret(row.apiKeyCipher)),
    modelName: row.modelName,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    enable1mContext: row.enable1mContext,
    loopMaxTokens: row.loopMaxTokens,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

// GET — list models for current tenant
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.LLM_MODEL_READ);

    const { searchParams } = request.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 10);
    const search = searchParams.get('search') ?? '';

    const rows = await db.select().from(llmModel).where(eq(llmModel.ownerId, tenantId));
    let models = rows.map(toModel);
    if (search) {
      const s = search.toLowerCase();
      models = models.filter(
        (m) => m.name.toLowerCase().includes(s) || m.modelName.toLowerCase().includes(s)
      );
    }

    const total = models.length;
    const offset = (page - 1) * limit;
    const paged = limit === 0 ? models : models.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      total,
      offset,
      limit: limit || total,
      models: paged
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create a model (encrypts apiKey)
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.LLM_MODEL_CREATE);
    const body = await request.json();
    const { name, provider, baseUrl, apiKey, modelName } = body;

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (!provider || !VALID_PROVIDERS.has(provider))
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    if (!baseUrl) return NextResponse.json({ error: 'baseUrl required' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'apiKey required' }, { status: 400 });
    if (!modelName) return NextResponse.json({ error: 'modelName required' }, { status: 400 });

    const [existing] = await db
      .select()
      .from(llmModel)
      .where(and(eq(llmModel.ownerId, tenantId), eq(llmModel.name, name)))
      .limit(1);
    if (existing)
      return NextResponse.json({ error: 'A model with this name already exists' }, { status: 409 });

    const id = randomUUID();
    await db.insert(llmModel).values({
      id,
      ownerId: tenantId,
      name,
      provider,
      baseUrl,
      apiKeyCipher: encryptSecret(apiKey),
      modelName,
      temperature: body.temperature ?? 0.7,
      maxTokens: body.maxTokens ?? 8192,
      enable1mContext: body.enable1mContext ?? false,
      loopMaxTokens: body.loopMaxTokens ?? null,
      isActive: body.isActive ?? true
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
