import { navGroups } from '../../config/nav-config';
import { menuPermissions } from './permissions';

/**
 * Returns the first route the given permission set may enter, in sidebar order.
 * Rules mirror `useFilteredNavItems` exactly so the landing page always equals
 * the first item the user actually sees in their sidebar:
 *   - skip non-route links (`#`, `/`)
 *   - skip parent containers (items with sub-items, e.g. Forms / Account)
 *   - items without an `access.menu` gate are always accessible (e.g. demos)
 *   - otherwise accessible iff the user holds ≥1 of the menu's button permissions
 *
 * Pure data/function — usable on both server and client. Returns null when the
 * user has no accessible top-level page (caller should route to /no-access).
 */
export function getFirstAccessiblePath(permissions: readonly string[]): string | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!item.url || item.url === '#' || item.url === '/') continue;
      if (item.items && item.items.length > 0) continue;

      const menu = item.access?.menu;
      if (!menu) return item.url;

      const perms = menuPermissions(menu);
      if (perms.length === 0 || perms.some((p) => permissions.includes(p))) {
        return item.url;
      }
    }
  }
  return null;
}
