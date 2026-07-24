# breadcrumb

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Only
`BreadcrumbLink` touched radix (Slot/asChild) → `useRender` + `mergeProps`.
Typecheck clean.

## Changed

- `src/components/ui/breadcrumb.tsx` — `Slot` import removed; `BreadcrumbLink`
  `asChild` → `render` via `useRender({ defaultTagName: 'a', … })` with the cast
  `data-slot` literal. Added `'use client'` (useRender is a hook). All other parts
  (nav/ol/li/span) were plain HTML already — unchanged. Leftover scan clean.

## Left alone

- `src/components/breadcrumbs.tsx` — the only consumer; uses plain
  `<BreadcrumbLink href>` (no asChild), no change needed.

## Behavior changes

None at existing call sites. API change for future ones: `asChild` → `render`
(e.g. `render={<Link href=…/>}` for next/link).

## Verify by hand

1. Any nested dashboard page: breadcrumb trail renders, links navigate, current
   page is non-clickable with `aria-current="page"`.
