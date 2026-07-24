'use client';

import { navGroups } from '@/config/nav-config';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';

type BreadcrumbItem = {
  title: string;
  link: string;
};

type NavCrumb = { title: string; url: string };

// Map extra URL segments that are NOT nav items (e.g. `/dashboard/product/new`)
// to i18n keys. Unmapped trailing segments (ids, etc.) are dropped from the trail.
const segmentKeyMap: Record<string, string> = {
  new: 'New',
  overview: 'Overview',
  basic: 'Basic Form',
  'multi-step': 'Multi-Step Form',
  'sheet-form': 'Sheet & Dialog',
  advanced: 'Advanced Patterns'
};

function isUnder(pathname: string, url: string) {
  return url !== '#' && url !== '' && (pathname === url || pathname.startsWith(`${url}/`));
}

// Walk the nav tree and find the longest nav URL that is an ancestor (or exact
// match) of the current pathname. Returns the crumb trail — a top-level item
// yields a single crumb; a sub-item yields [parent, child].
function findNavTrail(pathname: string): { trail: NavCrumb[]; matchedLength: number } | null {
  let best: { trail: NavCrumb[]; matchedLength: number } | null = null;

  for (const group of navGroups) {
    for (const item of group.items) {
      if (isUnder(pathname, item.url)) {
        const candidate = {
          trail: [{ title: item.title, url: item.url }],
          matchedLength: item.url.length
        };
        if (!best || candidate.matchedLength > best.matchedLength) best = candidate;
      }
      for (const sub of item.items ?? []) {
        if (isUnder(pathname, sub.url)) {
          const candidate = {
            trail: [
              { title: item.title, url: item.url !== '#' ? item.url : sub.url },
              { title: sub.title, url: sub.url }
            ],
            matchedLength: sub.url.length
          };
          if (!best || candidate.matchedLength > best.matchedLength) best = candidate;
        }
      }
    }
  }
  return best;
}

export function useBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const match = findNavTrail(pathname);

    if (match) {
      return match.trail.map((c) => ({ title: t(c.title), link: c.url }));
    }

    // Fallback for pages without a nav ancestor: build from URL segments,
    // skipping the leading 'dashboard' route-group prefix so siblings don't
    // appear as children of the dashboard.
    const segments = pathname.split('/').filter(Boolean);
    const startIndex = segments[0] === 'dashboard' ? 1 : 0;
    return segments.slice(startIndex).map((segment, index) => {
      const key = segmentKeyMap[segment];
      const title = key ? t(key) : segment.charAt(0).toUpperCase() + segment.slice(1);
      const link = `/${segments.slice(0, startIndex + index + 1).join('/')}`;
      return { title, link };
    });
  }, [pathname, t]);

  return breadcrumbs;
}
