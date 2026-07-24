import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { userAuthAction } from './service';
import { agentAuthKeys } from './queries';
import type { UserAuthAction } from './types';

export const userAuthActionMutation = mutationOptions({
  mutationFn: ({ agentId, action }: { agentId: string; action: UserAuthAction }) =>
    userAuthAction(agentId, action),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: agentAuthKeys.all(variables.agentId) });
  }
});
