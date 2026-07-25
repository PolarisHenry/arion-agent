import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';
import type { LlmModelsResponse, LlmModelMutationPayload, LlmModelFilters } from './types';

export async function getLlmModels(
  filters: LlmModelFilters = {},
  opts: ApiFetchOptions = {}
): Promise<LlmModelsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);

  const res = await fetch(`${apiBaseUrl()}/api/llm-models?${params.toString()}`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}

export async function createLlmModel(data: LlmModelMutationPayload) {
  const res = await fetch(`${apiBaseUrl()}/api/llm-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function updateLlmModel(id: string, data: Partial<LlmModelMutationPayload>) {
  const res = await fetch(`${apiBaseUrl()}/api/llm-models/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteLlmModel(id: string) {
  const res = await fetch(`${apiBaseUrl()}/api/llm-models/${id}`, { method: 'DELETE' });
  await assertOk(res);
  return res.json();
}

/** Fetch available model ids from the provider's /models endpoint (server-side
 *  proxy keeps the key out of the browser). Used by the form's model dropdown. */
export async function probeLlmModels(params: {
  baseUrl: string;
  apiKey?: string;
  modelId?: string;
}): Promise<{ success: boolean; models: string[] }> {
  const res = await fetch(`${apiBaseUrl()}/api/llm-models/probe-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  await assertOk(res);
  return res.json();
}
