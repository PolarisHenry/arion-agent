import { queryOptions } from '@tanstack/react-query';
import type { ApiFetchOptions } from '@/lib/api-client';
import { getUsers } from './service';
import type { User, UserFilters } from './types';

export type { User };

export const userKeys = {
  all: ['users'] as const,
  list: (filters: UserFilters) => [...userKeys.all, 'list', filters] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const
};

export const usersQueryOptions = (filters: UserFilters, opts?: ApiFetchOptions) =>
  queryOptions({
    queryKey: userKeys.list(filters),
    queryFn: () => getUsers(filters, opts)
  });
