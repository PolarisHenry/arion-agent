# checkbox

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Cleanest
1:1 mapping. Typecheck clean.

## Changed

- `src/components/ui/checkbox.tsx` — import → `@base-ui/react/checkbox`; types →
  `CheckboxPrimitive.Root.Props`. Class renames: `data-[state=checked]:` →
  `data-checked:` (×3); `disabled:cursor-not-allowed disabled:opacity-50` →
  `data-disabled:*` because Base UI Root renders a `<span>` (no `:disabled` pseudo —
  the upstream registry keeps the dead classes; we corrected instead, per
  class-mapping.md). Leftover scan clean.

## Left alone

- `checkbox-field.tsx`, `demo-form.tsx` consumers — single-arg `onCheckedChange`
  handlers stay type-safe (Base UI adds a second eventDetails arg); the
  `checked as boolean` cast in demo-form is now exact (Base UI checked IS boolean).
  No `checked="indeterminate"` call sites existed.

## Behavior changes

- **Root element `<button>` → `<span>` + always-rendered hidden `<input>`.** Form
  submission unchanged; but any `peer-disabled:` styling keyed off the checkbox (the
  Label component has such classes) no longer triggers from the span — Base UI
  exposes `data-disabled` instead. No current pairing relies on it.
- `checked` no longer accepts `'indeterminate'` — future mixed-state usage needs the
  separate `indeterminate` prop.

## Verify by hand

1. Basic form (/dashboard/forms/basic): toggle checkboxes by click and Space;
   validation error styling still appears.
2. Data-table row selection checkboxes (if present) toggle correctly.
