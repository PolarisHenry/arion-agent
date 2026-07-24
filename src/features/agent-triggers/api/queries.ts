import { queryOptions } from '@tanstack/react-query';
import { getTriggers, getAllTriggers } from './service';

export const triggerKeys = {
  all: (agentId: string) => ['agent-triggers', agentId] as const
};

export const triggersQueryOptions = (agentId: string) =>
  queryOptions({
    queryKey: triggerKeys.all(agentId),
    queryFn: () => getTriggers(agentId),
    staleTime: 10_000
  });

/** All triggers across the tenant's agents (standalone Scheduled Tasks page). */
export const allTriggersQueryOptions = () =>
  queryOptions({
    queryKey: ['all-triggers'],
    queryFn: () => getAllTriggers(),
    staleTime: 10_000
  });
