import { describe, it, expect } from 'vitest';
import { getFirstAccessiblePath } from './nav-access';
import { ALL_PERMISSIONS, PERMISSIONS } from './permissions';

describe('getFirstAccessiblePath', () => {
  it('returns the dashboard overview for a master (all permissions)', () => {
    expect(getFirstAccessiblePath([...ALL_PERMISSIONS])).toBe('/dashboard/overview');
  });

  it('returns the dashboard when only dashboard:view is held', () => {
    expect(getFirstAccessiblePath([PERMISSIONS.DASHBOARD_VIEW])).toBe('/dashboard/overview');
  });

  it('skips the dashboard and lands on the first permitted menu (agents)', () => {
    expect(getFirstAccessiblePath([PERMISSIONS.AGENT_READ])).toBe('/dashboard/agents');
  });

  it('lands on product when only product:read is held (product precedes the no-gate demos)', () => {
    expect(getFirstAccessiblePath([PERMISSIONS.PRODUCT_READ])).toBe('/dashboard/product');
  });

  // Documents the known boundary: Kanban/Chat/etc. in the Demo group have no
  // access.menu, so (mirroring useFilteredNavItems) they are visible to everyone
  // and become the first accessible page for a user with zero gated permissions.
  // The /no-access fallback therefore only triggers once those demo entries are
  // removed from nav-config.
  it('falls back to the first always-accessible demo item when no gated menu is permitted', () => {
    expect(getFirstAccessiblePath([])).toBe('/dashboard/kanban');
  });
});
