import { queryOptions } from '@tanstack/react-query';
import { getAgentMemory } from './memory-service';

export const agentMemoryKeys = {
  all: (agentId: string) => ['agent-memory', agentId] as const
};

export const agentMemoryQueryOptions = (agentId: string) =>
  queryOptions({
    queryKey: agentMemoryKeys.all(agentId),
    queryFn: () => getAgentMemory(agentId),
    staleTime: 10_000
  });
