# navigation-menu

2026-07-04, transformation engine + registry anatomy (legacy style `new-york`; stock
wrapper, ZERO app consumers). The most restructured primitive: the in-Root Viewport
becomes Portal > Positioner > Popup > Viewport. Typecheck clean.

FIX 2026-07-11 (code review): deleted NavigationMenuIndicator entirely. It had
been remapped onto NavigationMenuPrimitive.Icon, which THROWS outside a
NavigationMenu.Item - crashing the documented shadcn placement (direct child of
List) - and its data-[state=visible/hidden] classes referenced attributes Base UI
never emits. Zero usages existed; Base UI has no trigger-tracking indicator
equivalent (matches the SKILL hard rule: no equivalent).

## Changed

- `src/components/ui/navigation-menu.tsx` — import → `@base-ui/react/navigation-menu`.
  - New `NavigationMenuPositioner` (registry anatomy) replaces the old
    `NavigationMenuViewport` wrapper div: Portal > Positioner (positioner-size vars,
    smooth top/left transitions) > Popup > Viewport. The Popup carries the user's
    visual tokens (`bg-popover text-popover-foreground rounded-md border shadow`) and
    `sideOffset={6}` reproduces the old `mt-1.5` gap. Vars:
    `--radix-navigation-menu-viewport-height/width` → `--popup-height/width` +
    `--positioner-height/width`.
  - `viewport` boolean prop DROPPED (removed upstream; Positioner always renders) —
    the viewportless class block in Content went with it. Root also gained the
    registry's `align` passthrough.
  - Trigger/`navigationMenuTriggerStyle`: `data-[state=open]:` → `data-popup-open:`;
    chevron `group-data-[state=open]:rotate-180` → `group-data-popup-open:rotate-180`.
  - Content: keeps the `data-[motion]` classes and user padding, plus the Base UI
    transition idiom (`data-starting-style`/`data-ending-style` with
    `data-[activation-direction]` translates).
  - Link: `data-[active=true]:` → `data-active:` (presence attr) ×4.
  - `Indicator` → `Icon` primitive (public name kept); `NavigationMenuViewport`
    export replaced by `NavigationMenuPositioner`.

## Left alone

- No consumers anywhere in `src/`.

## Behavior changes

- **Hover-open delay drops from 200ms (radix default) to 50ms** (Base UI default) —
  menus feel snappier/more eager. Flagged, not patched.
- `viewport={false}` mode no longer exists; the `NavigationMenuViewport` export is
  gone (replaced by `NavigationMenuPositioner`). No imports existed.
- Radix `Indicator` (the little arrow tracking the active trigger) maps to Base UI
  `Icon`, which is a different concept (trigger icon slot) — the old floating-arrow
  behavior has NO true equivalent; the wrapper keeps the markup for API
  compatibility but it will not track triggers. Flagged.

## Verify by hand

1. No live usages. If adopting: hover between triggers — panel slides/resizes
   between contents; note the faster 50ms open feel; Escape closes; links show
   active styling via data-active.
