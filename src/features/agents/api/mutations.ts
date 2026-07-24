import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { createAgent, updateAgent, deleteAgent, toggleAgentStatus } from './service';
import { agentKeys } from './queries';
import { agentAuthKeys } from '@/features/agent-auth/api/queries';
import type { AgentMutationPayload } from './types';

export const createAgentMutation = mutationOptions({
  mutationFn: (data: AgentMutationPayload) => createAgent(data),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
  }
});

export const updateAgentMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: Partial<AgentMutationPayload> }) =>
    updateAgent(id, values),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
    getQueryClient().invalidateQueries({ queryKey: agentAuthKeys.all(variables.id) });
  }
});

export const deleteAgentMutation = mutationOptions({
  mutationFn: (id: string) => deleteAgent(id),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
  }
});

export const toggleAgentStatusMutation = mutationOptions({
  mutationFn: ({ id, status }: { id: string; status: 'active' | 'paused' }) =>
    toggleAgentStatus(id, status),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
  }
});
