'use client';

import { useTranslation } from '@/lib/i18n';

/**
 * A thin wrapper around useTranslation() that can be used in client components
 * to translate infobar content strings.
 *
 * Works exactly like useTranslation() — returns a `t` function that looks up
 * keys in the i18n dictionaries.
 */
export function useInfobarTranslation() {
  return useTranslation();
}
