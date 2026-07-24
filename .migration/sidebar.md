# sidebar

2026-07-04, transformation engine (hand-rolled radix composition; matches the base
registry's own useRender idiom). Manual Slot/asChild idiom → `useRender` +
`mergeProps` on five parts. Typecheck + full build clean.

## Changed

- `src/components/ui/sidebar.tsx` — `@radix-ui/react-slot` import → `mergeProps` +
  `useRender`. Converted (asChild → `render`, `useRender.ComponentProps<tag>`):
  `SidebarGroupLabel` (div), `SidebarGroupAction` (button), `SidebarMenuButton`
  (button; the tooltip path now bakes the trigger into the render chain —
  `render: !tooltip ? render : <TooltipTrigger render={render}/>` — per the base
  registry), `SidebarMenuAction` (button), `SidebarMenuSubButton` (a). All data-*
  attributes and classes preserved (`data-active` still renders "true"/"false", so
  `data-[active=true]:` selectors keep matching). `SidebarMenuAction` showOnHover:
  dead `data-[state=open]:opacity-100` → `data-popup-open:opacity-100
  aria-expanded:opacity-100` (its real use is as a DropdownMenuTrigger render
  target). Earlier commits already fixed this file's Sheet/Tooltip/TooltipProvider
  usage.
- Call sites (asChild → render): `src/components/nav-projects.tsx`
  (SidebarMenuButton wrapping `<a>`), `src/components/nav-main.tsx`
  (SidebarMenuSubButton wrapping `<a>`), `src/components/layout/app-sidebar.tsx`
  (SidebarMenuSubButton + SidebarMenuButton wrapping next/link).

## Left alone

- All non-Slot sidebar parts (Sidebar, SidebarContent, rail, input, skeleton…) —
  plain HTML already.

## Behavior changes

- Public API: `asChild` no longer exists on the five converted parts — pass
  `render={<a/>}` etc. All call sites in the repo are converted; `grep -rn asChild
  src/` returns nothing.

## Verify by hand

1. Sidebar nav: every link navigates; active item is highlighted
   (data-active styling); icon-collapse mode shows tooltips on hover.
2. Project rows: hover shows the ⋮ action; open its menu — action stays visible
   while the menu is open (the aria-expanded/data-popup-open styling).
3. Mobile: sidebar opens as a sheet.
