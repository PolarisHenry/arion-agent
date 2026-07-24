// ============================================================
// China public-holiday awareness for the scheduler.
// ------------------------------------------------------------
// Standard cron only knows Mon–Fri; it can't model China's legal holidays
// (a Monday that's 国庆 should be skipped) or 调休 make-up workdays (a Saturday
// that's a 补班 should still fire). This module fetches the holiday-cn schedule
// (Gitee mirror first for CN reachability, jsDelivr CDN fallback), caches it in
// memory, and exposes isChineseWorkday() so workdaysOnly triggers can skip
// holidays and补 fire 调休 days.
//
// Source: holiday-cn (auto-scraped from 国务院办公厅 notices, updated yearly).
// Format: { year, days: [{ name, date: 'YYYY-MM-DD', isOffDay: boolean }] }
//   isOffDay=true  → 放假 (skip)
//   isOffDay=false → 调休补班 (weekend, but work — fire)
// ============================================================

import { createLogger } from './logger';

const log = createLogger('holidays');

export type HolidayMap = Map<string, boolean>; // 'YYYY-MM-DD' -> isOffDay

interface HolidayJson {
  year?: number;
  days?: { name?: string; date?: string; isOffDay?: boolean }[];
}

// Gitee first (fast + reachable in CN), then jsDelivr CDN as fallback.
const sources = (year: number): string[] => [
  `https://gitee.com/seimin/holiday-cn/raw/master/${year}.json`,
  `https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`
];

/** Parse holiday-cn JSON into a date→isOffDay map. Invalid input → empty map. */
export function parseHolidayJson(json: unknown): HolidayMap {
  const map: HolidayMap = new Map();
  if (!json || typeof json !== 'object') return map;
  const days = (json as HolidayJson).days;
  if (!Array.isArray(days)) return map;
  for (const d of days) {
    if (d && typeof d.date === 'string' && typeof d.isOffDay === 'boolean') {
      map.set(d.date, d.isOffDay);
    }
  }
  return map;
}

// In-memory cache keyed by year. Refreshed daily; on fetch failure the stale
// entry is kept (stale data > no data, > wrong guesses).
const cache = new Map<number, HolidayMap>();

async function fetchYear(year: number): Promise<HolidayMap | null> {
  for (const url of sources(year)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        log.warn(`fetch ${year} ${url} -> HTTP ${res.status}`);
        continue;
      }
      const map = parseHolidayJson(await res.json());
      if (map.size > 0) {
        log.info(`loaded ${year} holidays (${map.size} days) from ${url}`);
        return map;
      }
    } catch (err: any) {
      log.warn(`fetch ${year} ${url} failed: ${err?.message ?? err}`);
    }
  }
  return null;
}

/** Load current + next year into the cache. Idempotent; failures keep stale. */
export async function refreshHolidays(): Promise<void> {
  const year = new Date().getFullYear();
  for (const y of [year, year + 1]) {
    const map = await fetchYear(y);
    if (map) cache.set(y, map);
  }
}

/** 'YYYY-MM-DD' for `date` as seen in `tz` (en-CA yields ISO-style directly). */
function toDateKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Whether `date` (as seen in `tz`) is a Chinese workday:
 *  - in the holiday schedule → workday iff NOT isOffDay
 *    (调休补班 isOffDay=false → work; 放假 isOffDay=true → off)
 *  - not in schedule → ordinary Mon–Fri is a workday
 * Pass `holidays` to bypass the cache (for tests); omit to use the live cache.
 */
export function isChineseWorkday(date: Date, tz: string, holidays?: HolidayMap): boolean {
  const key = toDateKey(date, tz);
  const year = Number(key.slice(0, 4));
  const map = holidays ?? cache.get(year);
  if (map?.has(key)) {
    return !map.get(key)!;
  }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  return weekday !== 'Sat' && weekday !== 'Sun';
}
