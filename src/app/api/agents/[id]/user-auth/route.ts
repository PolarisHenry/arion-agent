// ============================================================
// Agent User Auth API — OAuth device flow lifecycle
// ------------------------------------------------------------
// GET  → current auth status (or 404 if never initiated)
// POST → { action: 'start' | 'complete' | 'revoke' }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { agent, agentUserAuth } from '@/lib/agent-schema';
import { eq, and, desc } from 'drizzle-orm';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

type Params = { params: Promise<{ id: string }> };

// GET — current user auth status for this agent
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_READ);
    const { id } = await params;

    // Verify agent belongs to tenant
    const [agentRow] = await db
      .select({ ownerId: agent.ownerId })
      .from(agent)
      .where(eq(agent.id, id))
      .limit(1);

    if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (agentRow.ownerId !== tenantId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Return the most recent auth row for this agent. With the UPSERT invariant
    // (one row per agent, see POST start) there is at most one, but desc guards
    // against any pre-fix duplicate rows.
    const [authRow] = await db
      .select()
      .from(agentUserAuth)
      .where(eq(agentUserAuth.agentId, id))
      .orderBy(desc(agentUserAuth.createdAt))
      .limit(1);

    if (!authRow) return NextResponse.json(null, { status: 404 });

    return NextResponse.json({
      id: authRow.id,
      ownerId: authRow.ownerId,
      agentId: authRow.agentId,
      status: authRow.status,
      deviceCode: authRow.deviceCode,
      verificationUrl: authRow.verificationUrl,
      userOpenId: authRow.userOpenId,
      userName: authRow.userName,
      grantedScopes: authRow.grantedScopes,
      tokenExpiresAt: authRow.tokenExpiresAt?.toISOString() ?? null,
      errorMsg: authRow.errorMsg,
      createdAt: authRow.createdAt.toISOString(),
      updatedAt: authRow.updatedAt.toISOString()
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — start / complete / revoke
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requirePermission(PERMISSIONS.AGENT_UPDATE);
    const { id } = await params;

    // Verify agent belongs to tenant AND is owned by requester
    const [agentRow] = await db.select().from(agent).where(eq(agent.id, id)).limit(1);

    if (!agentRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (agentRow.ownerId !== tenantId)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const action: string = body.action;

    if (action === 'start') {
      // One auth row per agent (UPSERT invariant): reuse the single row across
      // authorize/revoke/re-authorize cycles instead of inserting a new one
      // each time (which left stale 'revoked' rows that GET would surface).
      const [existing] = await db
        .select()
        .from(agentUserAuth)
        .where(eq(agentUserAuth.agentId, id))
        .limit(1);

      if (existing?.status === 'authorized') {
        // Allow re-authorization when token is expired without requiring an
        // explicit revoke step first.
        const isExpired = existing.tokenExpiresAt && existing.tokenExpiresAt < new Date();
        if (!isExpired) {
          return NextResponse.json(
            { success: false, error: 'Already authorized. Revoke first to re-authorize.' },
            { status: 409 }
          );
        }
        // Token expired — fall through to reset-in-place below.
      }

      if (existing?.status === 'awaiting_user') {
        // Already mid-flow — dashboard picks up the existing verification URL
        return NextResponse.json({ success: true });
      }

      if (existing) {
        // Row exists from a prior revoked/error/expired cycle — reset in place
        await db
          .update(agentUserAuth)
          .set({
            status: 'pending_start',
            deviceCode: null,
            verificationUrl: null,
            errorMsg: null,
            userOpenId: null,
            userName: null,
            grantedScopes: null,
            tokenExpiresAt: null
          })
          .where(eq(agentUserAuth.id, existing.id));
      } else {
        await db.insert(agentUserAuth).values({
          id: randomUUID(),
          ownerId: tenantId,
          agentId: id,
          status: 'pending_start'
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      // Mark the awaiting_user row as completing — worker picks it up
      const [authRow] = await db
        .select()
        .from(agentUserAuth)
        .where(and(eq(agentUserAuth.agentId, id), eq(agentUserAuth.status, 'awaiting_user')))
        .limit(1);

      if (!authRow) {
        return NextResponse.json(
          { success: false, error: 'No pending authorization to complete' },
          { status: 400 }
        );
      }

      await db
        .update(agentUserAuth)
        .set({ status: 'completing' })
        .where(eq(agentUserAuth.id, authRow.id));

      return NextResponse.json({ success: true });
    }

    if (action === 'revoke') {
      // Mark as 'revoking' (transient) — AuthManager picks it up, runs
      // `auth logout`, then sets terminal 'revoked'. Setting 'revoked' here
      // directly would make AuthManager re-process it every poll (infinite loop).
      await db
        .update(agentUserAuth)
        .set({ status: 'revoking' })
        .where(and(eq(agentUserAuth.agentId, id), eq(agentUserAuth.status, 'authorized')));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
