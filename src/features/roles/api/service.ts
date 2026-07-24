import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';
import type { RolesResponse, RoleMutationPayload, RoleFilters } from './types';

export async function getRoles(
  filters: RoleFilters = {},
  opts: ApiFetchOptions = {}
): Promise<RolesResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.sort) params.set('sort', filters.sort);

  const res = await fetch(`${apiBaseUrl()}/api/roles?${params.toString()}`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}

export async function getRoleById(
  id: string,
  opts: ApiFetchOptions = {}
): Promise<{ role: import('./types').Role }> {
  const res = await fetch(`${apiBaseUrl()}/api/roles/${id}`, { headers: opts.headers });
  await assertOk(res);
  return { role: await res.json() };
}

export async function createRole(data: RoleMutationPayload) {
  const res = await fetch(`${apiBaseUrl()}/api/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function updateRole(id: string, data: Partial<RoleMutationPayload>) {
  const res = await fetch(`${apiBaseUrl()}/api/roles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteRole(id: string) {
  const res = await fetch(`${apiBaseUrl()}/api/roles/${id}`, { method: 'DELETE' });
  await assertOk(res);
  return res.json();
}
