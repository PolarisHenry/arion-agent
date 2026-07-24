import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getLlmModels } from './service';
import type { LlmModelFilters } from './types';

export type { LlmModel } from './types';

export const llmModelKeys = {
  all: ['llm-models'] as const,
  list: (filters: LlmModelFilters = {}) => [...llmModelKeys.all, 'list', filters] as const,
  detail: (id: string) => [...llmModelKeys.all, 'detail', id] as const
};

export const llmModelsQueryOptions = (filters: LlmModelFilters = {}, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: llmModelKeys.list(filters),
    queryFn: () => getLlmModels(filters, opts),
    staleTime: 30_000
  });
