# toggle

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Callable
primitive, direct mapping. Typecheck clean.

## Changed

- `src/components/ui/toggle.tsx` — import → `@base-ui/react/toggle` (callable, no
  `.Root`); types → `TogglePrimitive.Props & VariantProps<…>`. Class rename in
  `toggleVariants`: `data-[state=on]:` → `data-pressed:` (×2). `disabled:*` classes
  KEPT — Base UI Toggle still renders a real `<button>`. Leftover scan clean.

## Left alone

- `toggleVariants` consumers (toggle-group) — updated in the same run; see
  .migration/toggle-group.md.

## Behavior changes

- Radix `onPressedChange(pressed)` → Base UI adds an eventDetails second arg;
  single-arg handlers unaffected. No standalone Toggle call sites exist in app code.

## Verify by hand

1. Covered via toggle-group (demo form); a standalone Toggle press should flip
   the accent style and aria-pressed.
