import { APP_TIMEZONE } from './timezone';

export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {}
) {
  if (!date) return '';

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIMEZONE,
      month: opts.month ?? 'long',
      day: opts.day ?? 'numeric',
      year: opts.year ?? 'numeric',
      ...opts
    }).format(new Date(date));
  } catch {
    return '';
  }
}

/**
 * Format a timestamp as 'YYYY-MM-DD HH:mm' in the project timezone
 * (APP_TIMEZONE, default Asia/Shanghai) — the shape the dashboard tables use.
 *
 * Deterministic across server and client: Intl.DateTimeFormat with a fixed IANA
 * timeZone produces identical output in both (Beijing has no DST), so it keeps
 * the hydration-safety the old per-table UTC getUTC*() helpers relied on, while
 * showing local time instead of UTC. Mirrors the pattern in
 * src/worker/core/agent-runtime.ts (buildCurrentTimeContext).
 */
export function formatDateTimeTz(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: opts.timeZone ?? APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    // Intl may emit '24' for midnight with hour12:false — normalize to '00'.
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
  } catch {
    return '';
  }
}
