import { registerApp } from '@larksuiteoapi/node-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

// ============================================================
// In-memory device-flow registry
// ============================================================
// Each call to registerApp runs the entire OAuth Device
// Authorization Grant lifecycle in the background. This Map
// lets the frontend poll the flow status independently.
// Expired / completed flows are cleaned up lazily.
// ============================================================

interface FlowEntry {
  flowId: string;
  status: 'pending' | 'completed' | 'error' | 'expired' | 'access_denied';
  verificationUrl: string;
  expireIn: number;
  startedAt: number;
  result?: { appId: string; appSecret: string };
  error?: string;
  controller: AbortController;
}

const flows = new Map<string, FlowEntry>();

function cleanupFlow(flowId: string) {
  setTimeout(() => flows.delete(flowId), 60_000); // keep around for 1 min after finish
}

// POST — start a one-click app creation device flow
export async function POST(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.AGENT_CREATE);

    const body = await request.json().catch(() => ({}));
    const { appName, appDesc } = body;

    const flowId = randomUUID();
    const controller = new AbortController();
    let verificationUrl = '';
    let expireIn = 600;

    // Wrap onQRCodeReady in a Promise so we can await it instead of
    // using a fragile fixed 200ms timeout. The first request after
    // startup often has cold-start latency (DNS, TLS, API call) that
    // exceeds 200ms, causing verificationUrl to stay empty — the QR
    // code would not render and the whole flow would appear broken.
    let resolveQrReady: (() => void) | null = null;
    const qrReady = new Promise<void>((resolve) => {
      resolveQrReady = resolve;
    });

    const promise = registerApp({
      signal: controller.signal,
      createOnly: true,
      appPreset: {
        name: appName ? `${appName}` : undefined,
        desc: appDesc ? `${appDesc}` : undefined
      },
      addons: {
        scopes: {
          tenant: ['application:application:self_manage']
        }
      },
      onQRCodeReady: (info) => {
        verificationUrl = info.url;
        expireIn = info.expireIn ?? 600;
        resolveQrReady?.();
      }
    })
      .then((result: any) => {
        const entry = flows.get(flowId);
        if (entry) {
          entry.status = 'completed';
          entry.result = {
            appId: result.client_id,
            appSecret: result.client_secret
          };
        }
        cleanupFlow(flowId);
        return result;
      })
      .catch((err: any) => {
        const entry = flows.get(flowId);
        if (entry) {
          const msg = err?.message ?? err?.code ?? 'Unknown error';
          if (msg?.includes('access_denied')) entry.status = 'access_denied';
          else if (msg?.includes('expired')) entry.status = 'expired';
          else entry.status = 'error';
          entry.error = msg;
        }
        cleanupFlow(flowId);
      });

    // Wait for onQRCodeReady to fire (max 15 s fallback so we never
    // hang indefinitely). This replaces a fragile fixed 200 ms sleep
    // that failed on cold starts.
    await Promise.race([qrReady, new Promise((resolve) => setTimeout(resolve, 15_000))]);

    flows.set(flowId, {
      flowId,
      status: 'pending',
      verificationUrl,
      expireIn,
      startedAt: Date.now(),
      controller
    });

    return NextResponse.json({
      success: true,
      flowId,
      verificationUrl,
      expireIn
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// GET — poll a device flow status
export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.AGENT_READ);

    const { searchParams } = request.nextUrl;
    const flowId = searchParams.get('flowId');

    if (!flowId) return NextResponse.json({ error: 'flowId required' }, { status: 400 });

    const entry = flows.get(flowId);
    if (!entry) return NextResponse.json({ error: 'Flow not found or expired' }, { status: 404 });

    const elapsed = Date.now() - entry.startedAt;
    if (entry.status === 'pending' && elapsed > entry.expireIn * 1000) {
      entry.status = 'expired';
      entry.controller.abort();
      cleanupFlow(flowId);
    }

    return NextResponse.json({
      status: entry.status,
      ...(entry.result ? { appId: entry.result.appId, appSecret: entry.result.appSecret } : {}),
      ...(entry.error ? { error: entry.error } : {})
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE — cancel an active device flow
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const flowId = searchParams.get('flowId');

    if (!flowId) return NextResponse.json({ error: 'flowId required' }, { status: 400 });

    const entry = flows.get(flowId);
    if (entry) {
      entry.controller.abort();
      entry.status = 'access_denied';
      cleanupFlow(flowId);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
