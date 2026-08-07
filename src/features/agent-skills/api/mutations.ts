import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { createSkill, updateSkill, deleteSkill } from './service';
import { skillKeys } from './queries';
import type { SkillMutationPayload } from './types';

export const createSkillMutation = mutationOptions({
  mutationFn: ({ agentId, values }: { agentId: string; values: SkillMutationPayload }) =>
    createSkill(agentId, values),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: skillKeys.all(variables.agentId) });
  }
});

export const updateSkillMutation = mutationOptions({
  mutationFn: ({
    agentId,
    skillId,
    values
  }: {
    agentId: string;
    skillId: string;
    values: Partial<SkillMutationPayload>;
  }) => updateSkill(agentId, skillId, values),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: skillKeys.all(variables.agentId) });
  }
});

export const deleteSkillMutation = mutationOptions({
  mutationFn: ({ agentId, skillId }: { agentId: string; skillId: string }) =>
    deleteSkill(agentId, skillId),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({ queryKey: skillKeys.all(variables.agentId) });
  }
});
