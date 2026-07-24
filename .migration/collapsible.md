# collapsible

2026-07-04, transformation engine (legacy style `new-york`; stock passthrough
wrapper). Content → Panel; two sidebar call sites repointed (asChild → render, state
class re-keyed). Typecheck clean.

## Changed

- `src/components/ui/collapsible.tsx` — import → `@base-ui/react/collapsible`;
  `CollapsibleTrigger`/`CollapsibleContent` primitives → `Trigger`/`Panel`; types →
  `.Props`. No classes in this wrapper. Leftover scan clean.
- `src/components/nav-main.tsx` — consumer: `<Collapsible asChild><SidebarMenuItem>`
  → `render={<SidebarMenuItem />}` (children hoisted; stray wrapper tag removed);
  `<CollapsibleTrigger asChild><SidebarMenuButton>` → `render={<SidebarMenuButton/>}`
  with children as trigger children. Chevron class: Base UI's Collapsible ROOT emits
  no state attribute (verified in d.ts — only Trigger `data-panel-open` and Panel
  `data-open/closed`), so `group-data-[state=open]/collapsible:rotate-90` was dead;
  moved the `group/collapsible` marker onto the trigger button and re-keyed the
  chevron to `group-data-panel-open/collapsible:rotate-90`.
- `src/components/layout/app-sidebar.tsx` — same three fixes on its Collapsible nav
  block.

## Left alone

- `SidebarMenuButton`/`SidebarMenuItem` internals — still radix-composed (sidebar.tsx
  migrates in a later run); they spread props to their root elements, so they work
  as Base UI `render` targets today.
- The footer DropdownMenu block in app-sidebar (`data-[state=open]:`,
  `--radix-dropdown-menu-trigger-width`) — belongs to the dropdown-menu migration.

## Behavior changes

None beyond the attribute relocation handled above.

## Verify by hand

1. Sidebar: expand/collapse each nav group — chevron rotates 90° when open, submenu
   shows/hides, active item highlight persists.
2. Collapse the sidebar to icon mode and re-expand — collapsibles still work.
