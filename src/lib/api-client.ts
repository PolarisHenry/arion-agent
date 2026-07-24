// ============================================================
// Shared API fetch helpers
// ------------------------------------------------------------
// The feature services (users / roles / products) are imported by
// both Server Components (which prefetchQuery during SSR) and
// Client Components (which run useQuery / useMutation). Two things
// must work in BOTH contexts:
//
//   1. The URL — Node's fetch cannot parse a hostless (relative)
//      URL, so on the server we prepend an absolute origin via
//      apiBaseUrl(). Browsers handle relative URLs fine (return '').
//
//   2. Authentication — the /api/* routes read the session from the
//      incoming request's Cookie. A browser sends it automatically;
//      a server-to-self fetch does not, so Server Components forward
//      the Cookie via forwardHeaders() (see server-fetch.ts).
// ============================================================

export type ApiFetchOptions = {
  headers?: Record<string, string>;
};

/** Absolute API origin on the server; '' (same-origin relative) on the client. */
export function apiBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
}

const BASE_URL = '/api';

/**
 * Throw on non-2xx, surfacing the server's `{ error }` message so the UI can
 * show the real reason (and translate it via t()). Falls back to `HTTP <status>`.
 */
export async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `HTTP ${res.status}`);
  }
}

/**
 * Map a server error string to a localized, user-friendly toast message.
 *
 * - Permission errors are dynamic ("Missing permission: product:create"), so we
 *   match the prefix and substitute the action — the permission code is itself
 *   an i18n key (e.g. product:create → "添加产品"), yielding e.g.
 *   没有「添加产品」的权限.
 * - Other strings go through t(): add the server's exact error string as an
 *   i18n key in BOTH dictionaries to translate it; otherwise it shows as-is.
 * - Empty/unknown → generic.
 */
export function localizeApiError(
  message: string | undefined | null,
  t: (key: string) => string
): string {
  if (!message) return t('Something went wrong.');
  const m = message.match(/^Missing permission:\s*(.+)$/);
  if (m) {
    return t('No permission for action').replace('{action}', t(m[1]));
  }
  return t(message);
}

export async function apiClient<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers }
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
