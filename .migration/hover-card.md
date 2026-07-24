# hover-card

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Primitive
renamed to PreviewCard; public HoverCard* names kept. Typecheck clean.

## Changed

- `src/components/ui/hover-card.tsx` — import `@radix-ui/react-hover-card` →
  `@base-ui/react/preview-card` (aliased `HoverCardPrimitive`). Content → Portal >
  Positioner (`isolate z-50`, forwarded align/alignOffset/side/sideOffset) > Popup
  with `data-[state=*]` → presence attrs and origin var → `--transform-origin`.
  User defaults preserved (align center, sideOffset 4). Leftover scan clean.

## Left alone

- No HoverCard consumers exist in app code.

## Behavior changes

- Open delay: radix Root `openDelay` default 700ms → Base UI Trigger `delay`
  default 600ms (wrapper never surfaced it; future call sites set delays on the
  TRIGGER, not the Root).
- Trigger renders an `<a>` in both libraries; unchanged.

## Verify by hand

1. No live usages. If adopting: hover a trigger — card appears after ~600ms,
   stays open while hovering the card, fades/zooms away on leave.
