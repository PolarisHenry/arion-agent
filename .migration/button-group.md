# button-group

2026-07-04, transformation engine (legacy style `new-york`). Only `ButtonGroupText`
touched radix (`Slot.Root` from the unified `radix-ui` package) → `useRender` +
`mergeProps`. Typecheck clean.

## Changed

- `src/components/ui/button-group.tsx` — `Slot` import removed; `ButtonGroupText`
  `asChild` → `render` via `useRender({ defaultTagName: 'div', … })` (no data-slot
  on this part in the original — kept that way, so no literal cast needed). Added
  `'use client'` and an explicit React import (useRender is a hook). `ButtonGroup`
  (plain div) and `ButtonGroupSeparator` (composes the already-migrated Separator)
  unchanged. Leftover scan clean.

## Left alone

- `ButtonGroupSeparator` — now transitively Base UI via separator.tsx; its
  `orientation='vertical'` default and classes still line up with Base UI's
  identical `data-[orientation]` attribute.
- No consumer passes `asChild` to `ButtonGroupText`.

## Behavior changes

None at existing call sites. API change for future ones: `asChild` → `render`.

## Verify by hand

1. Any grouped-control toolbar (table filters use similar composition): adjacent
   buttons share borders/radius correctly in both orientations.
