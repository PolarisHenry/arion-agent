# tabs

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Trigger →
Tab, Content → Panel. Typecheck clean.

## Changed

- `src/components/ui/tabs.tsx` — import → `@base-ui/react/tabs`; `Trigger` → `Tab`,
  `Content` → `Panel`; types → `.Props`. Class rewrites on the Tab:
  `data-[state=active]:` → `data-active:` (×4 incl. dark: variants); added
  `aria-disabled:pointer-events-none aria-disabled:opacity-50` alongside `disabled:*`.
  Leftover scan clean.

## Left alone

- Consumers (overview.tsx, notifications-page.tsx) — plain string
  `defaultValue`/`value` usage works unchanged; no `activationMode` call sites.

## Behavior changes

- **Tab activation is now MANUAL on keyboard focus** (Base UI default; radix default
  was automatic — arrowing between tabs activated them immediately, now Enter/Space
  is required). The shadcn base registry accepts this default; opt back with
  `<TabsList activateOnFocus>` per call site if wanted. Flagged, not patched.
- Hidden panels are marked `data-hidden` (radix marked ACTIVE state on content);
  no app CSS targeted the old attribute.

## Verify by hand

1. Overview page tabs: click switches panels. Arrow keys move focus between tabs —
   note the panel does NOT switch until Enter/Space (the flagged delta).
2. Notifications page tabs: same, plus badge counts render inside triggers.
