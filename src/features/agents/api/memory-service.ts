import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';

export type AgentMemoryEntry = {
  id: string;
  key: string;
  value: string;
  label: string | null;
  category: string | null;
  note: string | null;
  importance: string;
  expiresAt: string | null;
  updatedAt: string;
};

export type AgentMemoryResponse = {
  success: boolean;
  memory: AgentMemoryEntry[];
};

export async function getAgentMemory(
  agentId: string,
  opts: ApiFetchOptions = {}
): Promise<AgentMemoryResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/memory`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}

export async function deleteAgentMemory(agentId: string, id: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/memory/${id}`, {
    method: 'DELETE'
  });
  await assertOk(res);
}
