# menubar

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper, ZERO app
consumers). Radix Menubar → Base UI `Menubar` (callable root) + `Menu.*` for
everything else. Typecheck clean.

FIX 2026-07-11 (code review): MenubarContent gained `data-closed:animate-out`
plus `max-h-(--available-height) overflow-x-hidden overflow-y-auto` for parity
with dropdown/context menus - without animate-out the kept fade/zoom exit
utilities were inert, and MenubarSubContent (which composes MenubarContent) had
lost the exit animation it had on main. Also removed the redundant
`data-highlighted:*` twins (see dropdown-menu report).

## Changed

- `src/components/ui/menubar.tsx` — root from `@base-ui/react/menubar` (single
  callable part); `MenubarMenu` → `Menu.Root`, Trigger/Portal/items/groups/
  separators all → `Menu.*` parts per the canonical mapping. Content → Portal >
  Positioner > Popup keeping the user's defaults (`align='start'`,
  `alignOffset={-4}`, `sideOffset={8}`); trigger and sub-trigger open state
  `data-[state=open]:` → `data-popup-open:`; SubContent composes MenubarContent;
  origin var → `--transform-origin`; items gain `data-highlighted:*` variants.
  Leftover scan clean.

## Left alone

- No consumers anywhere in `src/`.

## Behavior changes

- API deltas for future call sites: Menubar `value`/`onValueChange` (active menu
  control) are DROPPED — control per-menu `open` instead; `loop` → `loopFocus`
  (default flips to true); CheckboxItem/RadioItem don't close on click by default.

## Verify by hand

1. No live usages. If adopting: click a menubar trigger, arrow between menus (they
   open as you move), submenus open on hover.
