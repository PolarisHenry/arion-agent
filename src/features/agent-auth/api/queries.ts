import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getAgentUserAuth } from './service';
import { isUserAuthFlowActive } from './flow-status';

export const agentAuthKeys = {
  all: (agentId: string) => ['agent-auth', agentId] as const
};

export const agentUserAuthQueryOptions = (agentId: string, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: agentAuthKeys.all(agentId),
    queryFn: () => getAgentUserAuth(agentId, opts),
    staleTime: 5_000,
    // Only poll while an auth flow is actually in progress. Without this gate
    // the always-mounted UserIdentityPanel polls every 3s forever on the agent
    // detail page, even when status is a stable terminal state.
    refetchInterval: (query) => (isUserAuthFlowActive(query.state.data?.status) ? 3_000 : false)
  });
