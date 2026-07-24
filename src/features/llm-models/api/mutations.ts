import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { createLlmModel, updateLlmModel, deleteLlmModel } from './service';
import { llmModelKeys } from './queries';
import type { LlmModelMutationPayload } from './types';

export const createLlmModelMutation = mutationOptions({
  mutationFn: (data: LlmModelMutationPayload) => createLlmModel(data),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: llmModelKeys.all });
  }
});

export const updateLlmModelMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: Partial<LlmModelMutationPayload> }) =>
    updateLlmModel(id, values),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: llmModelKeys.all });
  }
});

export const deleteLlmModelMutation = mutationOptions({
  mutationFn: (id: string) => deleteLlmModel(id),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: llmModelKeys.all });
  }
});
