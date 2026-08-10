import { describe, it, expect } from 'vitest';
import { localizeApiError } from './api-client';

// A t() that returns the key unchanged — lets the tests assert routing logic
// without standing up the full i18n dictionary. Placeholder substitution is
// verified by passing a real template via the keyed entry below.
const t = (key: string) => key;
// A t() that resolves the two localization keys localizeApiError references,
// so placeholder substitution can be asserted end-to-end.
const dictT = (key: string) => {
  const dict: Record<string, string> = {
    'Something went wrong.': '出了点问题。',
    'No permission for action': '没有「{action}」的权限',
    'Resource in use': '该资源正被 {count} 个数字员工使用，请先解除引用后再删除。'
  };
  return dict[key] ?? key;
};

describe('localizeApiError', () => {
  it('falls back to a generic message when there is none', () => {
    expect(localizeApiError(undefined, t)).toBe('Something went wrong.');
    expect(localizeApiError('', t)).toBe('Something went wrong.');
  });

  it('routes unknown strings through t() verbatim', () => {
    expect(localizeApiError('Unexpected error', t)).toBe('Unexpected error');
  });

  it('formats the Missing permission: prefix with the action substituted', () => {
    const out = localizeApiError('Missing permission: agent:create', dictT);
    expect(out).toBe('没有「agent:create」的权限');
  });

  it('formats the in_use:<count> conflict with the count substituted', () => {
    const out = localizeApiError('in_use:3', dictT);
    expect(out).toBe('该资源正被 3 个数字员工使用，请先解除引用后再删除。');
  });

  it('substitutes multi-digit counts', () => {
    const out = localizeApiError('in_use:12', dictT);
    expect(out).toContain('12 个数字员工');
  });

  it('does not treat a bare in_use (no count) as a usage conflict', () => {
    // Defensive: server always sends in_use:<count>; a malformed value must
    // not match the conflict branch and should fall through to t() verbatim.
    expect(localizeApiError('in_use', t)).toBe('in_use');
  });
});
