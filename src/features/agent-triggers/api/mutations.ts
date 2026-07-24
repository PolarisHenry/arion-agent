import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { createTrigger, updateTrigger, deleteTrigger } from './service';
import { triggerKeys } from './queries';
import type { TriggerMutationPayload } from './types';

export const createTriggerMutation = mutationOptions({
  mutationFn: ({ agentId, values }: { agentId: string; values: TriggerMutationPayload }) =>
    createTrigger(agentId, values),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: triggerKeys.all(variables.agentId) });
  }
});

export const updateTriggerMutation = mutationOptions({
  mutationFn: ({
    agentId,
    triggerId,
    values
  }: {
    agentId: string;
    triggerId: string;
    values: Partial<TriggerMutationPayload>;
  }) => updateTrigger(agentId, triggerId, values),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: triggerKeys.all(variables.agentId) });
  }
});

export const deleteTriggerMutation = mutationOptions({
  mutationFn: ({ agentId, triggerId }: { agentId: string; triggerId: string }) =>
    deleteTrigger(agentId, triggerId),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: triggerKeys.all(variables.agentId) });
  }
});
