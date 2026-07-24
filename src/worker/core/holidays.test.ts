import { describe, it, expect } from 'vitest';
import { parseHolidayJson, isChineseWorkday, type HolidayMap } from './holidays';

const TZ = 'Asia/Shanghai';
const at = (iso: string) => new Date(iso);

describe('parseHolidayJson', () => {
  it('maps days to date→isOffDay', () => {
    const json = {
      year: 2026,
      days: [
        { name: '元旦', date: '2026-01-01', isOffDay: true },
        { name: '元旦', date: '2026-01-04', isOffDay: false }
      ]
    };
    expect(parseHolidayJson(json)).toEqual(
      new Map([
        ['2026-01-01', true],
        ['2026-01-04', false]
      ])
    );
  });

  it('returns an empty map for malformed input', () => {
    expect(parseHolidayJson(null).size).toBe(0);
    expect(parseHolidayJson({}).size).toBe(0);
    expect(parseHolidayJson({ days: 'nope' }).size).toBe(0);
  });

  it('skips entries missing date or isOffDay', () => {
    const map = parseHolidayJson({
      days: [
        { date: '2026-01-01', isOffDay: true },
        { date: '2026-01-02' }, // missing isOffDay
        { isOffDay: false }, // missing date
        { name: 'x', date: '2026-01-03', isOffDay: 'yes' } // wrong type
      ]
    });
    expect(map.size).toBe(1);
    expect(map.get('2026-01-01')).toBe(true);
  });
});

describe('isChineseWorkday', () => {
  // 2026 real schedule: 元旦 01-01 (Thu, off), 01-04 (Sun, make-up work)
  const holidays: HolidayMap = new Map([
    ['2026-01-01', true], // 法定假日（周四）
    ['2026-01-04', false] // 调休补班（周日）
  ]);

  it('an ordinary weekday not in the schedule is a workday', () => {
    // 2026-07-20 Monday, not a holiday
    expect(isChineseWorkday(at('2026-07-20T12:00:00+08:00'), TZ, holidays)).toBe(true);
  });

  it('an ordinary weekend not in the schedule is not a workday', () => {
    // 2026-07-25 Saturday
    expect(isChineseWorkday(at('2026-07-25T12:00:00+08:00'), TZ, holidays)).toBe(false);
  });

  it('a legal holiday on a weekday is skipped (not a workday)', () => {
    // 2026-01-01 元旦, Thursday but isOffDay=true
    expect(isChineseWorkday(at('2026-01-01T12:00:00+08:00'), TZ, holidays)).toBe(false);
  });

  it('a make-up workday on a weekend still fires (is a workday)', () => {
    // 2026-01-04 调休补班, Sunday but isOffDay=false
    expect(isChineseWorkday(at('2026-01-04T12:00:00+08:00'), TZ, holidays)).toBe(true);
  });

  it('without an injected map, falls back to ordinary weekday logic', () => {
    // No cache in test env → cache.get() is undefined → Mon–Fri rule.
    expect(isChineseWorkday(at('2026-07-25T12:00:00+08:00'), TZ, undefined)).toBe(false);
    expect(isChineseWorkday(at('2026-07-20T12:00:00+08:00'), TZ, undefined)).toBe(true);
  });
});
