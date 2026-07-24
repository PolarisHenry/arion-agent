import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { forwardHeaders } from '@/lib/server-fetch';
import { agentsQueryOptions } from '../api/queries';
import { llmModelsQueryOptions } from '@/features/llm-models/api/queries';
import { AgentsTable } from './agents-table';

export default async function AgentListingPage() {
  const queryClient = getQueryClient();
  const fwd = await forwardHeaders();
  void queryClient.prefetchQuery(agentsQueryOptions({ page: 1, limit: 10 }, fwd));
  void queryClient.prefetchQuery(llmModelsQueryOptions({ page: 1, limit: 0 }, fwd));
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AgentsTable />
    </HydrationBoundary>
  );
}
