import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, UnauthorizedError, ForbiddenError } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

// ============================================================
// GET /api/agents/app-info?appId=xxx&appSecret=xxx
// ============================================================
// Fetches Feishu app metadata (name, avatar, description) using
// the app's own credentials. Used by the "Add Existing App" flow
// to auto-fill the agent name.
// ============================================================

async function getAppAccessToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const data = await res.json();
  if (!data?.app_access_token) {
    throw new Error(data?.msg || 'Failed to get access token');
  }
  return data.app_access_token;
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.AGENT_CREATE);

    const { searchParams } = request.nextUrl;
    const appId = searchParams.get('appId');
    const appSecret = searchParams.get('appSecret');

    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'appId and appSecret required' }, { status: 400 });
    }

    const token = await getAppAccessToken(appId, appSecret);

    const appRes = await fetch(
      `https://open.feishu.cn/open-apis/application/v6/applications/${appId}?lang=zh_cn`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const appData = await appRes.json();

    if (appData.code !== 0) {
      return NextResponse.json(
        { error: appData.msg || 'Failed to fetch app info' },
        { status: 400 }
      );
    }

    const app = appData.data.app;
    return NextResponse.json({
      success: true,
      appId: app.app_id,
      appName: app.app_name,
      avatarUrl: app.avatar_url,
      description: app.description
    });
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof ForbiddenError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: (e as Error).message || 'Failed' }, { status: 500 });
  }
}
