import { describe, it, expect } from 'vitest';
import { isUserAuthFlowActive } from './flow-status';

describe('isUserAuthFlowActive', () => {
  it('is true for in-progress device-flow / revoke states', () => {
    expect(isUserAuthFlowActive('pending_start')).toBe(true);
    expect(isUserAuthFlowActive('awaiting_user')).toBe(true);
    expect(isUserAuthFlowActive('completing')).toBe(true);
    expect(isUserAuthFlowActive('revoking')).toBe(true);
  });

  it('is false for terminal states — these must NOT poll', () => {
    expect(isUserAuthFlowActive('authorized')).toBe(false);
    expect(isUserAuthFlowActive('revoked')).toBe(false);
    expect(isUserAuthFlowActive('error')).toBe(false);
  });

  it('is false when there is no status yet (no row / not loaded)', () => {
    expect(isUserAuthFlowActive(null)).toBe(false);
    expect(isUserAuthFlowActive(undefined)).toBe(false);
  });
});
