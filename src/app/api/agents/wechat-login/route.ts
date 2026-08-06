// ============================================================
// WeChat (iLink) QR login — dashboard-driven scan flow.
//
// POST   /api/agents/wechat-login               start a login session
//   body (create):  { name, systemPrompt, llmModelId, description?, avatar? }
//   body (re-auth): { agentId }   — re-scan an existing wechat agent (-14)
// GET    /api/agents/wechat-login?id=...        poll status (qr/scanned/confirmed/...)
//
// The SDK runs the QR login in the background (it blocks until scan +
// confirm). Its callbacks surface state into an in-memory session the
// widget polls. On success the SDK has persisted credentials to the
// per-agent storageDir; this route records the bot identity in
// platformConfig (and inserts the agent row on create). The worker later
// resumes from the same storageDir.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agent, llmModel } from '@/lib/agent-schema';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { encryptSecret } from '@/lib/crypto';
import { WeChatBot } from '@wechatbot/wechatbot';
import { storageDirFor } from '@/worker/core/platform/wechat-channel';

interface LoginSession {
  status: 'pending' | 'qr' | 'scanned' | 'confirmed' | 'expired' | 'error';
  qrUrl?: string;
  agentId?: string;
  error?: string;
  tenantId: string;
  startedAt: number;
}

// Per-process login sessions. v1 assumes a single server instance (the
// dashboard + worker also share one WECHATBOT_DATA_DIR volume).
const sessions = new Map<string, LoginSession>();

function cleanup(sessionId: string) {
  setTimeout(() => sessions.delete(sessionId), 60_000);
}

interface CreateFields {
  systemPrompt: string;
  llmModelId: string;
  description?: string;
  avatar?: string;
  /** Optional: link this WeChat agent to a Lark agent to borrow its Feishu
   *  operational identity (appId/secret/profile/user OAuth). */
  linkedAgentId?: string;
}

/** Kick off a background QR login for `agentId`. On success either insert a
 *  new wechat agent (create) or refresh identity + clear needsReauth (re-auth). */
function startLogin(
  agentId: string,
  name: string,
  tenantId: string,
  mode: 'create' | 'reauth',
  create?: CreateFields
) {
  const sessionId = randomUUID();
  const session: LoginSession = { status: 'pending', tenantId, startedAt: Date.now() };
  sessions.set(sessionId, session);

  const bot = new WeChatBot({
    storageDir: storageDirFor(agentId),
    botAgent: `arion-agent/${name}`
  });
  bot
    .login({
      callbacks: {
        onQrUrl: (url) => {
          session.status = 'qr';
          session.qrUrl = url;
        },
        onScanned: () => {
          session.status = 'scanned';
        },
        onExpired: () => {
          session.status = 'expired';
          session.qrUrl = undefined;
        }
      }
    })
    .then(async (creds) => {
      if (mode === 'reauth') {
        const [row] = await db.select().from(agent).where(eq(agent.id, agentId)).limit(1);
        const cur = (row?.platformConfig as Record<string, unknown> | null) ?? {};
        await db
          .update(agent)
          .set({
            platformConfig: {
              ...cur,
              botId: creds.accountId,
              ilinkUserId: creds.userId,
              needsReauth: false
            }
          })
          .where(eq(agent.id, agentId));
      } else if (create) {
        await db.insert(agent).values({
          id: agentId,
          ownerId: tenantId,
          name,
          description: create.description ?? null,
          avatar: create.avatar ?? null,
          appId: '',
          appSecretCipher: encryptSecret(''),
          larkCliProfile: `agent-${agentId}`,
          platform: 'wechat',
          platformConfig: {
            botId: creds.accountId,
            ilinkUserId: creds.userId,
            needsReauth: false
          },
          linkedAgentId: create.linkedAgentId ?? null,
          systemPrompt: create.systemPrompt,
          llmModelId: create.llmModelId,
          status: 'active',
          configVersion: 1
        });
      }
      session.status = 'confirmed';
      session.agentId = agentId;
      cleanup(sessionId);
    })
    .catch((err: unknown) => {
      session.status = 'error';
      session.error = err instanceof Error ? err.message : String(err);
      cleanup(sessionId);
    });

  return NextResponse.json({ sessionId });
}

// POST — start a WeChat QR login (create or re-auth).
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_CREATE);
    const body = await request.json().catch(() => ({}));
    const {
      agentId: reauthAgentId,
      name,
      systemPrompt,
      llmModelId,
      description,
      avatar,
      linkedAgentId
    } = body;

    // ---- Re-auth: re-scan an existing wechat agent (e.g. after -14) ----
    if (reauthAgentId) {
      const [row] = await db
        .select()
        .from(agent)
        .where(and(eq(agent.id, reauthAgentId), eq(agent.ownerId, tenantId)))
        .limit(1);
      if (!row) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      if ((row.platform ?? 'lark') !== 'wechat')
        return NextResponse.json({ error: 'Not a wechat agent' }, { status: 400 });
      return startLogin(reauthAgentId, row.name, tenantId, 'reauth');
    }

    // ---- Create: validate + FK + uniqueness, then start login ----
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    if (!systemPrompt)
      return NextResponse.json({ error: 'systemPrompt required' }, { status: 400 });
    if (!llmModelId) return NextResponse.json({ error: 'llmModelId required' }, { status: 400 });

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

    // Optional Feishu link: must be a Lark agent in this tenant.
    if (linkedAgentId) {
      const [linked] = await db
        .select()
        .from(agent)
        .where(and(eq(agent.id, linkedAgentId), eq(agent.ownerId, tenantId)))
        .limit(1);
      if (!linked || (linked.platform ?? 'lark') !== 'lark')
        return NextResponse.json(
          { error: 'Linked agent must be a Lark agent in your tenant' },
          { status: 400 }
        );
    }

    return startLogin(randomUUID(), name, tenantId, 'create', {
      systemPrompt,
      llmModelId,
      description,
      avatar,
      linkedAgentId
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// GET — poll login status for the dashboard widget.
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const s = sessions.get(id);
  if (!s) return NextResponse.json({ status: 'unknown' }, { status: 404 });
  return NextResponse.json({
    status: s.status,
    url: s.qrUrl,
    agentId: s.agentId,
    error: s.error
  });
}
