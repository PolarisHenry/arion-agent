import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { searchParamsCache } from '@/lib/searchparams';
import { forwardHeaders } from '@/lib/server-fetch';
import { productsQueryOptions } from '../api/queries';
import { ProductTable } from './product-tables';

export default async function ProductListingPage() {
  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');
  const categories = searchParamsCache.get('category');
  const sort = searchParamsCache.get('sort');

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(categories && { categories }),
    ...(sort && { sort })
  };

  const queryClient = getQueryClient();
  const fwd = await forwardHeaders();

  void queryClient.prefetchQuery(productsQueryOptions(filters, fwd));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductTable />
    </HydrationBoundary>
  );
}
