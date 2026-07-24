# slider

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper).
Restructured: `Root > Track > (Range, Thumbs)` → `Root > Control > Track >
(Indicator)` + Thumbs inside Control, with `thumbAlignment='edge'` to keep the
radix thumb feel. Typecheck clean after two consumer fixes.

## Changed

- `src/components/ui/slider.tsx` — import → `@base-ui/react/slider`; new `Control`
  part is the interactive surface: the old Root layout classes (`relative flex
  touch-none items-center select-none` + vertical variants) moved onto Control per
  the registry split; Root keeps orientation sizing + consumer `className`.
  `Range` → `Indicator` (dropped its `absolute` — the primitive positions it);
  `data-[disabled]:`/`disabled:*` → `data-disabled:*`. The `_values` thumb-count
  logic is kept. Leftover scan clean.
- `src/components/forms/fields/slider-field.tsx:41` — consumer fix: `v[0]` on the
  widened `number | readonly number[]` value → `Array.isArray(v) ? v[0] : v`.
- `src/components/ui/table/data-table-slider-filter.tsx:103` — consumer fix:
  handler parameter widened from `RangeValue` to `number | readonly number[]`
  (its existing Array.isArray+length guard already handled the rest).

## Left alone

- No `onValueCommit` (→ `onValueCommitted`) or `inverted` call sites existed.

## Behavior changes

- `onValueChange` now passes the value in the SHAPE given (number stays number);
  both consumers pass arrays, so they still receive arrays.
- Consumer `className` now lands on Root (outer box), while the flex layout lives
  on Control — custom height/spacing overrides passed by future consumers may need
  to target the control instead. Current consumers pass no className.

## Verify by hand

1. Slider filter in a data table: drag both thumbs, values commit to the filter;
   keyboard arrows move the focused thumb.
2. Slider form field: drag updates the numeric readout; min/max respected.
