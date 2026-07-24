import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getRoles } from './service';
import type { Role, RoleFilters } from './types';

export type { Role };

export const roleKeys = {
  all: ['roles'] as const,
  list: (filters: RoleFilters = {}) => [...roleKeys.all, 'list', filters] as const,
  detail: (id: string) => [...roleKeys.all, 'detail', id] as const
};

export const rolesQueryOptions = (filters: RoleFilters = {}, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: roleKeys.list(filters),
    queryFn: () => getRoles(filters, opts),
    staleTime: 30_000
  });
