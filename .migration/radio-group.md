# radio-group

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper).
Restructured into TWO subpath imports per the mapping: the group from
`@base-ui/react/radio-group` (callable), items from `@base-ui/react/radio`
(`Radio.Root` + `Radio.Indicator`). Typecheck clean.

## Changed

- `src/components/ui/radio-group.tsx` — `RadioGroupPrimitive.Root` → callable
  `<RadioGroupPrimitive>`; `RadioGroupPrimitive.Item` → `RadioPrimitive.Root`;
  `RadioGroupPrimitive.Indicator` → `RadioPrimitive.Indicator`. Types →
  `RadioGroupPrimitive.Props` / `RadioPrimitive.Root.Props`. `disabled:*` →
  `data-disabled:*` on the item (renders `<span>` now). All other classes and the
  Icons.circle indicator untouched. Leftover scan clean.

## Left alone

- `radio-group-field.tsx` — plain `value`/`onValueChange` usage; single-arg handler
  stays type-safe. No `orientation`/`loop`/`dir` call sites (all dropped in Base UI).

## Behavior changes

- Item element `<button>` → `<span>` + hidden `<input>` (same peer-selector note as
  checkbox).
- Radix `orientation` prop no longer exists; Base UI handles both arrow-key axes
  automatically. No call sites used it.

## Verify by hand

1. Forms with radio groups: arrow keys move selection (both axes), click selects,
   only one selected per group, form submits the chosen value.
