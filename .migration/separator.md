# separator

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Direct
mapping to the callable `@base-ui/react/separator` primitive. Typecheck clean.

## Changed

- `src/components/ui/separator.tsx` — `SeparatorPrimitive.Root` (unified `radix-ui`
  import) → callable `<SeparatorPrimitive>` from `@base-ui/react/separator`;
  props → `SeparatorPrimitive.Props`. The `decorative` prop is DROPPED (no Base UI
  equivalent — its separator is always semantic); no consumer passed it. Classes
  unchanged (`data-[orientation=...]` attributes are identical in Base UI).
  Leftover scan clean.

## Left alone

- All consumers — none pass `decorative` or anything beyond
  `className`/`orientation`.

## Behavior changes

- **Separators are now semantic.** The radix wrapper defaulted `decorative={true}`
  (rendered `role="none"`); Base UI always renders `role="separator"`. Screen
  readers will announce separators they previously skipped. If a purely visual rule
  is wanted somewhere, use a plain `<div aria-hidden>` at that call site. Flagged,
  not patched — this is Base UI's designed behavior.

## Verify by hand

1. Any page with separators (user-nav dropdown, page headers): they render as before
   (1px line, horizontal/vertical).
2. Optional a11y check: VoiceOver rotor now lists separators.
