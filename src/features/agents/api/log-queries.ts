import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getAgentLogs } from './log-service';

export const agentLogKeys = {
  all: (agentId: string) => ['agent-logs', agentId] as const,
  list: (agentId: string, filters: { page?: number; limit?: number } = {}) =>
    [...agentLogKeys.all(agentId), 'list', filters] as const
};

export const agentLogsQueryOptions = (
  agentId: string,
  filters: { page?: number; limit?: number } = {},
  opts?: ApiFetchOptions
) =>
  queryOptions({
    queryKey: agentLogKeys.list(agentId, filters),
    queryFn: () => getAgentLogs(agentId, filters, opts),
    staleTime: 15_000
  });
