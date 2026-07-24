# label

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper, no
customizations). Base UI has NO Label primitive — replaced with a native `<label>`
per the hard rule. Typecheck clean.

## Changed

- `src/components/ui/label.tsx` — `LabelPrimitive.Root` (from the unified `radix-ui`
  package) → native `<label>`; props `React.ComponentProps<'label'>`. Classes
  unchanged; `select-none` already covers radix Label's only behavioral extra
  (no text selection on double click). Leftover scan clean.

## Left alone

- All 5 consumer files — they pass `htmlFor`/`className`/children only, all valid on
  a native label; no call-site changes needed.
- `field.tsx` / `tanstack-form.tsx` label usage — composes this wrapper, unaffected.

## Behavior changes

None. Radix Label rendered a native `<label>` too.

## Verify by hand

1. Open the basic form page (/dashboard/forms/basic): click a field label — focus
   moves into the input.
2. Double-click a label rapidly — no text selection flash.
3. Disabled field: label shows the dimmed/disabled styling (peer-disabled classes).
