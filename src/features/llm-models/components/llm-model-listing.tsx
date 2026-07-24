import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { forwardHeaders } from '@/lib/server-fetch';
import { llmModelsQueryOptions } from '../api/queries';
import { LlmModelsTable } from './llm-models-table';

export default async function LlmModelListingPage() {
  const queryClient = getQueryClient();
  const fwd = await forwardHeaders();
  void queryClient.prefetchQuery(llmModelsQueryOptions({ page: 1, limit: 10 }, fwd));
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LlmModelsTable />
    </HydrationBoundary>
  );
}
