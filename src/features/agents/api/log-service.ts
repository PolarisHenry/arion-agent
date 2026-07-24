import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';

export type AgentLogEntry = {
  id: string;
  chatId: string | null;
  type: 'message' | 'trigger' | 'tool';
  messageContent: string | null;
  responseContent: string | null;
  toolCalls: { tool: string; args: unknown; result?: string }[] | null;
  tokensUsed: number | null;
  durationMs: number | null;
  status: 'success' | 'error';
  error: string | null;
  createdAt: string;
};

export type AgentLogsResponse = {
  success: boolean;
  total: number;
  offset: number;
  limit: number;
  logs: AgentLogEntry[];
};

export async function getAgentLogs(
  agentId: string,
  filters: { page?: number; limit?: number } = {},
  opts: ApiFetchOptions = {}
): Promise<AgentLogsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/logs?${params.toString()}`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}
