# tooltip

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Content →
Portal > Positioner > Popup with the forward rule; Provider delay renamed. Typecheck
clean.

## Changed

- `src/components/ui/tooltip.tsx` — import → `@base-ui/react/tooltip`.
  - Provider: `delayDuration = 0` → `delay = 0` (renamed prop, user's 0 default kept).
  - Content: positioning props (`side`/`sideOffset`/`align`/`alignOffset`) declared,
    destructured, and FORWARDED to `<Positioner className='isolate z-50'>`; Popup
    carries the user's classes with `data-[state=closed]:` → `data-closed:` and
    `origin-(--radix-tooltip-content-transform-origin)` → `origin-(--transform-origin)`.
    Default `sideOffset` 0 → 4: radix auto-inserted the arrow's height between
    trigger and content, Base UI does not — 4 reproduces the same visual gap (golden
    default).
  - Arrow: user's rotated-square visuals kept (`bg-primary size-2.5 rotate-45
    rounded-[2px]`), with the base-registry per-side positioning classes added
    (Base UI arrows need explicit per-side offsets; radix positioned its svg
    automatically).
- `src/components/ui/sidebar.tsx`, `src/components/ui/infobar.tsx` — consumers:
  `TooltipProvider delayDuration={0}` → `delay={0}`;
  `<TooltipTrigger asChild>{button}</TooltipTrigger>` → `render={button}`.
- `src/components/themes/theme-mode-toggle.tsx` — `TooltipTrigger asChild` →
  `render={<Button/>}`.

## Left alone

- `TooltipContent hidden={…}` in sidebar/infobar — plain DOM attribute, still works
  on the Popup.

## Behavior changes

- Radix `skipDelayDuration` (300ms default) becomes Base UI Provider `timeout`
  (default 400ms) — not surfaced by the wrapper; instant-open chaining between
  adjacent tooltips feels marginally different.
- `disableHoverableContent` has no equivalent (no call sites).

## Verify by hand

1. Collapse the sidebar to icon mode: hover icons — tooltips appear to the right,
   arrow pointing at the icon, correct gap.
2. Theme toggle tooltip appears instantly (delay 0) and fades/zooms out on leave.
