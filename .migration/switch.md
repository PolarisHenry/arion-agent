# switch

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). 1:1
mapping. Typecheck clean.

## Changed

- `src/components/ui/switch.tsx` — import → `@base-ui/react/switch`; types →
  `SwitchPrimitive.Root.Props`. Class renames on Root and Thumb:
  `data-[state=checked]:` → `data-checked:`, `data-[state=unchecked]:` →
  `data-unchecked:`; `disabled:*` → `data-disabled:*` (Root renders `<span>` now).
  Leftover scan clean.

## Left alone

- `switch-field.tsx` — `checked={value} onCheckedChange={field.handleChange}`
  stays type-safe (single-arg handler; added eventDetails arg ignored).

## Behavior changes

- Root element `<button>` → `<span>` + hidden `<input>` (same note as checkbox:
  `peer-disabled:` selectors keyed on it go dead; `data-disabled` replaces them).

## Verify by hand

1. Forms demo with a switch: click and Space toggle; thumb slides; disabled state
   dims.
