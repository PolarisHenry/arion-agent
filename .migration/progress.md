# progress

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper).
Restructured per the mapping: Base UI requires Indicator inside the new `Track`
part and computes the fill itself. Typecheck clean.

## Changed

- `src/components/ui/progress.tsx` — import → `@base-ui/react/progress`; anatomy
  `Root > Indicator` → `Root > Track > Indicator`. The manual radix fill transform
  (`style={{transform: translateX(-(100-value)%)}}`) is DELETED — the primitive
  sets the Indicator width itself. Consumer API preserved: Root keeps the visual
  bar classes (`bg-primary/20 h-2 rounded-full…` + className, unlike the base
  registry which moves the bar to Track), Track is a structural `h-full w-full`,
  Indicator keeps `bg-primary transition-all` (dropped `w-full flex-1`, which
  existed only to support the deleted transform). Leftover scan clean.

## Left alone

- Consumers (multi-step form, pokemon-info, file-uploader) — all pass only
  `value`; no `className`, `max`, or `getValueLabel` call sites.

## Behavior changes

- Radix `data-state="loading|complete|indeterminate"` attributes are replaced by
  `data-progressing`/`data-complete`/`data-indeterminate`. No app CSS targeted the
  old ones.

## Verify by hand

1. Multi-step form (/dashboard/forms/multi-step): bar fills per step, animates
   between steps.
2. File uploader: progress fills during upload.
3. React-query demo pokemon stats: bars proportional to stat values.
