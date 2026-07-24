# toggle-group

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Group is
the callable `@base-ui/react/toggle-group`; items reuse the `@base-ui/react/toggle`
primitive (Base UI has no separate ToggleGroup.Item). Typecheck clean.

## Changed

- `src/components/ui/toggle-group.tsx` — `ToggleGroupPrimitive.Root` → callable
  `<ToggleGroupPrimitive>`; `ToggleGroupPrimitive.Item` → `<TogglePrimitive>` with
  `value` (Toggle participates in group state automatically). Types →
  `ToggleGroupPrimitive.Props` / `TogglePrimitive.Props`. The variant/size context
  and all classes untouched (`data-[variant=outline]` etc. are our own attributes).
  Leftover scan clean.
- `src/components/forms/demo-form.tsx:529` — consumer fix per consumer-props.md:
  `type='multiple'` → `multiple` (value was already a `string[]`, matching Base
  UI's always-array group value).

## Left alone

- No `rovingFocus`/`loop`/`orientation` call sites (dropped/renamed in Base UI).

## Behavior changes

- Single-select groups (`type='single'` in radix) would map to the DEFAULT Base UI
  behavior (no `multiple`); none exist in app code today.
- Group `onValueChange` gains an eventDetails arg; the demo-form single-arg lambda
  is unaffected.

## Verify by hand

1. Advanced form (/dashboard/forms — Text Formatting group): click bold/italic/
   underline — multiple can be active at once; arrow keys move focus between
   items; form state receives the array.
