# context-menu

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper, ZERO app
consumers). Radix ContextMenu → `@base-ui/react/context-menu` (same anatomy as the
Menu mapping). Typecheck clean.

## Changed

- `src/components/ui/context-menu.tsx` — full canonical mapping: Content → Portal >
  Positioner > Popup (Positioner props exposed; no default side/align — the popup
  anchors to the pointer, matching radix); `Label` → `GroupLabel`; `ItemIndicator` →
  split indicators; `Sub`/`SubTrigger` → `SubmenuRoot`/`SubmenuTrigger`
  (`data-popup-open`); SubContent composes the public Content; vars →
  `--available-height`/`--transform-origin`; items gain `data-highlighted:*`
  variants alongside `focus:*`. Leftover scan clean.

## Left alone

- No consumers anywhere in `src/`.

## Behavior changes

- API deltas for future call sites: Root `modal` and Trigger `disabled` are DROPPED
  in Base UI (no equivalents); CheckboxItem/RadioItem default to NOT closing on
  click; Base UI adds long-press-to-open on touch.

## Verify by hand

1. No live usages. If adopting: right-click a trigger area — menu opens at the
   pointer; submenu opens on hover; Escape closes.
