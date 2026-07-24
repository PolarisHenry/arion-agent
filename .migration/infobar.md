# infobar

2026-07-04, transformation engine (hand-rolled radix composition mirroring
sidebar.tsx). Same five-part Slot → `useRender` + `mergeProps` conversion.
Typecheck + full build clean.

## Changed

- `src/components/ui/infobar.tsx` — `@radix-ui/react-slot` import → `mergeProps` +
  `useRender`. Converted: `InfobarGroupLabel`, `InfobarGroupAction`,
  `InfobarMenuButton` (tooltip render-chain), `InfobarMenuAction` (dead
  `data-[state=open]:opacity-100` → `data-popup-open:opacity-100
  aria-expanded:opacity-100`), `InfobarMenuSubButton`. Classes/data attributes
  preserved. `TooltipProvider delayDuration` → `delay` and
  `TooltipTrigger asChild` → `render` were fixed in the tooltip commit; the mobile
  Sheet usage was verified in the sheet commit.

## Left alone

- All plain-HTML infobar parts; `info-button.tsx` (already migrated with button).

## Behavior changes

- Public API: `asChild` → `render` on the five converted parts. No app call sites
  passed asChild to infobar parts.

## Verify by hand

1. Click an ⓘ InfoButton: infobar opens on the right with content; collapse
   toggle works; mobile shows it as a right-side sheet.
