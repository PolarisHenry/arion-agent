'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

export interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    ownerId: string | null;
    roleId: string;
  };
  permissions: string[];
}

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) throw new Error('Failed to fetch current user');
  return res.json();
}

export const meQueryOptions = () =>
  queryOptions({
    queryKey: ['me'] as const,
    queryFn: fetchMe,
    staleTime: 30_000
  });

export function useMe() {
  return useQuery(meQueryOptions());
}
