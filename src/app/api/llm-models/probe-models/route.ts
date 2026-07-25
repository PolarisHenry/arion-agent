// ============================================================
// LLM Models probe — fetch available model ids from a provider's
// OpenAI-compatible /models endpoint so the form can show a dropdown
// instead of forcing the user to type the model name by hand.
// Server-side only: keeps the apiKey out of the browser and sidesteps
// provider CORS. Accepts either a plaintext apiKey (create flow, key
// not yet stored) or a modelId (edit flow — decrypt the stored key).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { llmModel } from '@/lib/agent-schema';
import { eq } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { decryptSecret } from '@/lib/crypto';

type ProbeBody = {
  baseUrl?: string;
  /** Plaintext key (create flow). Mutually exclusive with modelId. */
  apiKey?: string;
  /** Existing model id (edit flow) — the stored key is decrypted server-side. */
  modelId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.LLM_MODEL_UPDATE);
    const body = (await request.json()) as ProbeBody;
    const { baseUrl, apiKey, modelId } = body;

    if (!baseUrl || !baseUrl.trim()) {
      return NextResponse.json({ error: 'baseUrl required' }, { status: 400 });
    }

    // Resolve the key: prefer the plaintext apiKey from the create flow; fall
    // back to the stored (decrypted) key of an existing model.
    let key = apiKey;
    if ((!key || !key.trim()) && modelId) {
      const [row] = await db.select().from(llmModel).where(eq(llmModel.id, modelId)).limit(1);
      if (!row) return NextResponse.json({ error: 'model not found' }, { status: 404 });
      if (row.ownerId !== tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      key = decryptSecret(row.apiKeyCipher);
    }
    if (!key || !key.trim()) {
      return NextResponse.json({ error: 'apiKey required' }, { status: 400 });
    }

    // Standard OpenAI-compatible list endpoint. Trim trailing slashes so
    // `https://host/v1/` and `https://host/v1` behave the same.
    const url = `${baseUrl.replace(/\/+$/, '')}/models`;
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000)
    }).catch(() => null);

    if (!upstream || !upstream.ok) {
      return NextResponse.json(
        { error: `provider /models request failed${upstream ? ` (${upstream.status})` : ''}` },
        { status: 502 }
      );
    }

    // OpenAI shape: { object: 'list', data: [{ id, ... }] }. Accept a bare
    // array too for non-standard proxies.
    const json = (await upstream.json()) as { data?: { id?: string }[] } | { id?: string }[];
    const list = Array.isArray(json) ? json : json?.data;
    const models = Array.isArray(list)
      ? list
          .map((m) => m?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .toSorted((a, b) => a.localeCompare(b))
      : [];

    return NextResponse.json({ success: true, models });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
