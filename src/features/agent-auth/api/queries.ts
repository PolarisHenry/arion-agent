import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getAgentUserAuth } from './service';

export const agentAuthKeys = {
  all: (agentId: string) => ['agent-auth', agentId] as const
};

export const agentUserAuthQueryOptions = (agentId: string, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: agentAuthKeys.all(agentId),
    queryFn: () => getAgentUserAuth(agentId, opts),
    staleTime: 5_000, // poll frequently during device flow
    refetchInterval: 3_000 // auto-poll for status changes
  });
