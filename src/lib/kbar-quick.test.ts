import { describe, expect, it } from 'vitest';
import { detectTimeConversion, isMathExpression, safeEval } from './kbar-quick';

describe('isMathExpression', () => {
  it('accepts arithmetic with operators', () => {
    expect(isMathExpression('1+2')).toBe(true);
    expect(isMathExpression('2 * 3')).toBe(true);
    expect(isMathExpression('(1+2)*3')).toBe(true);
    expect(isMathExpression('10/4')).toBe(true);
    expect(isMathExpression('7%3')).toBe(true);
  });

  it('rejects plain numbers (no operator)', () => {
    expect(isMathExpression('42')).toBe(false);
    expect(isMathExpression(' 123 ')).toBe(false);
  });

  it('rejects non-math text', () => {
    expect(isMathExpression('hello')).toBe(false);
    expect(isMathExpression('')).toBe(false);
    expect(isMathExpression('1+abc')).toBe(false);
  });
});

describe('safeEval', () => {
  it('evaluates arithmetic expressions', () => {
    expect(safeEval('1+2')).toBe('3');
    expect(safeEval('2*3')).toBe('6');
    expect(safeEval('(1+2)*3')).toBe('9');
    expect(safeEval('5%2')).toBe('1');
  });

  it('rounds float drift to 4 decimals', () => {
    expect(safeEval('0.1+0.2')).toBe('0.3');
    expect(safeEval('10/3')).toBe('3.3333');
  });

  it('returns null for non-finite or invalid input', () => {
    expect(safeEval('1/0')).toBeNull();
    expect(safeEval('1+')).toBeNull();
    expect(safeEval('abc')).toBeNull();
  });
});

describe('detectTimeConversion', () => {
  it('converts a 10-digit second timestamp to a date', () => {
    const r = detectTimeConversion('1698700000');
    expect(r?.kind).toBe('timestamp-to-date');
    expect(r?.result ?? '').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('converts a 13-digit ms timestamp to a date', () => {
    const r = detectTimeConversion('1698700000000');
    expect(r?.kind).toBe('timestamp-to-date');
    expect(r?.result ?? '').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('converts a date string to a ms timestamp', () => {
    const r = detectTimeConversion('2024-01-01 12:00:00');
    expect(r?.kind).toBe('date-to-timestamp');
    expect(Number.isInteger(Number(r?.result))).toBe(true);
    expect(Number(r?.result)).toBeGreaterThan(0);
  });

  it('returns null for non-time input', () => {
    expect(detectTimeConversion('12345')).toBeNull();
    expect(detectTimeConversion('hello')).toBeNull();
    expect(detectTimeConversion('12-34')).toBeNull();
  });
});
