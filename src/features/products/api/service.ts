// ============================================================
// Product Service — calls real /api/products routes
// ============================================================

import { apiBaseUrl, assertOk, type ApiFetchOptions } from '@/lib/api-client';
import type {
  ProductFilters,
  ProductsResponse,
  ProductByIdResponse,
  ProductMutationPayload
} from './types';

export async function getProducts(
  filters: ProductFilters,
  opts: ApiFetchOptions = {}
): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.categories) params.set('categories', filters.categories);
  if (filters.search) params.set('search', filters.search);
  if (filters.sort) params.set('sort', filters.sort);

  const res = await fetch(`${apiBaseUrl()}/api/products?${params.toString()}`, {
    headers: opts.headers
  });
  await assertOk(res);
  return res.json();
}

export async function getProductById(
  id: string,
  opts: ApiFetchOptions = {}
): Promise<ProductByIdResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/products/${id}`, { headers: opts.headers });
  await assertOk(res);
  return res.json();
}

export async function createProduct(data: ProductMutationPayload) {
  const res = await fetch(`${apiBaseUrl()}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function updateProduct(id: string, data: ProductMutationPayload) {
  const res = await fetch(`${apiBaseUrl()}/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteProduct(id: string) {
  const res = await fetch(`${apiBaseUrl()}/api/products/${id}`, { method: 'DELETE' });
  await assertOk(res);
  return res.json();
}
