'use client';

import { useMemo } from 'react';
import { useMe } from '@/hooks/use-me';
import { menuPermissions } from '@/lib/rbac/permissions';
import type { NavItem, NavGroup } from '@/types';

/**
 * Client-side nav filtering.
 * A menu item is shown iff the current user holds >=1 of that menu's button
 * permissions. Menu filtering is UX only — real security is at the API layer.
 */
export function useFilteredNavItems(items: NavItem[]) {
  const { data } = useMe();
  const permissions: string[] = data?.permissions ?? [];

  return useMemo(() => {
    return items.filter((item) => {
      if (!item.access?.menu) return true;
      const perms = menuPermissions(item.access.menu);
      if (perms.length === 0) return true;
      return perms.some((p) => permissions.includes(p));
    });
  }, [items, permissions]);
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  const filteredItems = useFilteredNavItems(groups.flatMap((g) => g.items));

  return useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        items: filteredItems.filter((item) => group.items.some((gi) => gi.title === item.title))
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, filteredItems]);
}
