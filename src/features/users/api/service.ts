// ============================================================
// User Service — calls real /api/users routes
// ============================================================

import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';
import type { UserFilters, UsersResponse, UserMutationPayload } from './types';

export async function getUsers(
  filters: UserFilters,
  opts: ApiFetchOptions = {}
): Promise<UsersResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.roles) params.set('roles', filters.roles);
  if (filters.search) params.set('search', filters.search);
  if (filters.sort) params.set('sort', filters.sort);

  const res = await fetch(`${apiBaseUrl()}/api/users?${params.toString()}`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}

export async function createUser(data: UserMutationPayload) {
  const res = await fetch(`${apiBaseUrl()}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function updateUser(id: string, data: Partial<UserMutationPayload>) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteUser(id: string) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${id}`, { method: 'DELETE' });
  await assertOk(res);
  return res.json();
}

export async function toggleUserEnabled(id: string, enabled: boolean) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  await assertOk(res);
  return res.json();
}
