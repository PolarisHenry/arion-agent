# badge

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Slot/
asChild idiom → `useRender` + `mergeProps` (non-button polymorphic per the worked
example). Typecheck clean.

FIX 2026-07-11 (code review): removed the 'use client' directive (also from
breadcrumb.tsx and button-group.tsx) - Base UI's useRender is RSC-safe by design
and the base registry ships these files without the directive; server components
(e.g. the overview layout's badges) no longer hydrate them.

## Changed

- `src/components/ui/badge.tsx` — `Slot` from `@radix-ui/react-slot` removed;
  `asChild` prop → `render` via `useRender({ defaultTagName: 'span', … })` with
  `mergeProps<'span'>` (the `data-slot` literal is cast to
  `React.ComponentProps<'span'>` per the mergeProps pitfall rule). Props type →
  `useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>`. Added
  `'use client'` (useRender is a hook); Badge remains renderable from server
  components across the client boundary. cva classes untouched. Leftover scan clean.

## Left alone

- All Badge consumers — none passed `asChild`; plain usage unchanged.
- `badgeVariants` export — unchanged.

## Behavior changes

None at existing call sites. API change for future ones: `asChild` → `render`.

## Verify by hand

1. Products table: status badges render as before.
2. Kanban cards / chat list: secondary and outline badges unchanged.
