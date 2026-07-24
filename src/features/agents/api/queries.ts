import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getAgents } from './service';
import type { AgentFilters } from './types';

export type { Agent } from './types';

export const agentKeys = {
  all: ['agents'] as const,
  list: (filters: AgentFilters = {}) => [...agentKeys.all, 'list', filters] as const,
  detail: (id: string) => [...agentKeys.all, 'detail', id] as const
};

export const agentsQueryOptions = (filters: AgentFilters = {}, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: agentKeys.list(filters),
    queryFn: () => getAgents(filters, opts),
    staleTime: 30_000
  });
