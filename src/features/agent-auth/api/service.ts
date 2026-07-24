import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';
import type { AgentUserAuth, UserAuthAction } from './types';

export async function getAgentUserAuth(
  agentId: string,
  opts: ApiFetchOptions = {}
): Promise<AgentUserAuth | null> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/user-auth`, {
    headers: opts.headers
  });
  if (res.status === 404) return null;
  await assertOk(res);
  return res.json();
}

export async function userAuthAction(
  agentId: string,
  action: UserAuthAction
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/user-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  await assertOk(res);
  return res.json();
}
