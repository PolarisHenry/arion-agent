import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { forwardHeaders } from '@/lib/server-fetch';
import { rolesQueryOptions } from '../api/queries';
import { RolesTable } from './roles-table';

export default async function RoleListingPage() {
  const queryClient = getQueryClient();
  const fwd = await forwardHeaders();

  void queryClient.prefetchQuery(rolesQueryOptions({ page: 1, limit: 10 }, fwd));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RolesTable />
    </HydrationBoundary>
  );
}
