import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getProducts, getProductById } from './service';
import type { Product, ProductFilters } from './types';

export type { Product };

export const productKeys = {
  all: ['products'] as const,
  list: (filters: ProductFilters) => [...productKeys.all, 'list', filters] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const
};

export const productsQueryOptions = (filters: ProductFilters, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: productKeys.list(filters),
    queryFn: () => getProducts(filters, opts)
  });

export const productByIdOptions = (id: string, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: productKeys.detail(id),
    queryFn: () => getProductById(id, opts)
  });
