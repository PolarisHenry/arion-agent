import { queryOptions } from '@tanstack/react-query';
import { getSkills } from './service';

export const skillKeys = {
  all: (agentId: string) => ['agent-skills', agentId] as const
};

export const skillsQueryOptions = (agentId: string) =>
  queryOptions({
    queryKey: skillKeys.all(agentId),
    queryFn: () => getSkills(agentId),
    staleTime: 10_000
  });
