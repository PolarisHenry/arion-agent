import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';
import type { AgentsResponse, AgentMutationPayload, AgentFilters } from './types';

export async function getAgents(
  filters: AgentFilters = {},
  opts: ApiFetchOptions = {}
): Promise<AgentsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.order) params.set('order', filters.order);
  const res = await fetch(`${apiBaseUrl()}/api/agents?${params.toString()}`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}

export async function getAgentById(id: string, opts: ApiFetchOptions = {}) {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${id}`, { headers: opts.headers });
  await assertOk(res);
  return res.json();
}

export async function createAgent(data: AgentMutationPayload) {
  const res = await fetch(`${apiBaseUrl()}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function updateAgent(id: string, data: Partial<AgentMutationPayload>) {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteAgent(id: string) {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${id}`, { method: 'DELETE' });
  await assertOk(res);
  return res.json();
}

export async function toggleAgentStatus(id: string, status: 'active' | 'paused') {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  await assertOk(res);
  return res.json();
}

// ============================================================
// One-click app creation via OAuth Device Authorization Grant
// ============================================================

export type RegisterAppStartResponse = {
  success: boolean;
  flowId: string;
  verificationUrl: string;
  expireIn: number;
};

export type RegisterAppPollResponse = {
  status: 'pending' | 'completed' | 'error' | 'expired' | 'access_denied';
  appId?: string;
  appSecret?: string;
  error?: string;
};

export async function startRegisterApp(payload: {
  appName?: string;
  appDesc?: string;
}): Promise<RegisterAppStartResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/register-app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await assertOk(res);
  return res.json();
}

export async function pollRegisterApp(flowId: string): Promise<RegisterAppPollResponse> {
  const res = await fetch(
    `${apiBaseUrl()}/api/agents/register-app?${new URLSearchParams({ flowId }).toString()}`
  );
  await assertOk(res);
  return res.json();
}

export async function cancelRegisterApp(flowId: string): Promise<void> {
  const res = await fetch(
    `${apiBaseUrl()}/api/agents/register-app?${new URLSearchParams({ flowId }).toString()}`,
    { method: 'DELETE' }
  );
  await assertOk(res);
}

// ============================================================
// Fetch existing app metadata
// ============================================================

export type AppInfoResponse = {
  success: boolean;
  appId: string;
  appName: string;
  avatarUrl: string;
  description: string;
};

export async function fetchAppInfo(appId: string, appSecret: string): Promise<AppInfoResponse> {
  const params = new URLSearchParams({ appId, appSecret });
  const res = await fetch(`${apiBaseUrl()}/api/agents/app-info?${params.toString()}`);
  await assertOk(res);
  return res.json();
}

// ============================================================
// WeChat (iLink) QR login — scan to create / re-auth a wechat agent
// ============================================================

export type WechatLoginStatus = {
  status: 'pending' | 'qr' | 'scanned' | 'confirmed' | 'expired' | 'error' | 'unknown';
  url?: string;
  agentId?: string;
  error?: string;
};

export async function startWechatLogin(payload: {
  name: string;
  systemPrompt: string;
  llmModelId: string;
  description?: string;
  avatar?: string;
  linkedAgentId?: string;
}): Promise<{ sessionId: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/wechat-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  await assertOk(res);
  return res.json();
}

/** Re-scan (re-auth) an existing wechat agent after a -14 session expiry. */
export async function startWechatReauth(agentId: string): Promise<{ sessionId: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/wechat-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId })
  });
  await assertOk(res);
  return res.json();
}

export async function pollWechatLogin(sessionId: string): Promise<WechatLoginStatus> {
  const res = await fetch(
    `${apiBaseUrl()}/api/agents/wechat-login?${new URLSearchParams({ id: sessionId }).toString()}`
  );
  await assertOk(res);
  return res.json();
}
