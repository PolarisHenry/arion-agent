// ============================================================
// Server-only fetch helpers
// ------------------------------------------------------------
// next/headers is server-only, so importing it here guarantees this
// module can never reach the Client bundle.
// ============================================================

import { headers } from 'next/headers';
import type { ApiFetchOptions } from './api-client';

/**
 * Build fetch options that forward the incoming request's Cookie, so that
 * server-to-self fetches to /api/* are authenticated. Use only inside Server
 * Components / Route Handlers.
 */
export async function forwardHeaders(): Promise<ApiFetchOptions> {
  const h = await headers();
  const cookie = h.get('cookie');
  return cookie ? { headers: { cookie } } : {};
}
