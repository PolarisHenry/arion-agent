# kanban

2026-07-04, transformation engine (hand-rolled radix composition over dnd-kit —
NOT a registry component). Manual `SlotPrimitive.Slot`/asChild idiom → `useRender`
+ `mergeProps` on five parts, keeping the dnd-kit wiring intact. Typecheck + full
build clean.

## Changed

- `src/components/ui/kanban.tsx` — unified `radix-ui` Slot import → `mergeProps` +
  `useRender`. Converted `KanbanBoard`, `KanbanColumn`, `KanbanColumnHandle`,
  `KanbanItem`, `KanbanItemHandle`:
  - Prop interfaces: `asChild?: boolean` → `render?: useRender.RenderProp`.
  - Composed refs (dnd-kit setNodeRef/activator) pass through useRender's `ref`
    option (mergeProps does NOT merge refs — documented pitfall).
  - The conditional dnd-kit spreads (`attributes`/`listeners` when
    asHandle/!disabled) are combined into one conditional mergeProps argument
    (mergeProps caps at 4 objects); handler merging is right-to-left per
    mergeProps semantics, preserving the original later-spread-wins ordering.
  - All data attributes, classes, and the drag-overlay logic unchanged.
- Call sites: `src/features/kanban/components/task-card.tsx` (`KanbanItem asChild`
  around the card div → `render={<div…/>}`),
  `src/features/kanban/components/board-column.tsx` (`KanbanColumnHandle asChild`
  around a Button → `render={<Button…/>}`).

## Left alone

- dnd-kit (`@dnd-kit/*`) usage — third-party on both sides, untouched.
- `KanbanOverlay` and contexts — no radix involvement.

## Behavior changes

- Public API: `asChild` → `render` on the five parts. Behavior is otherwise
  identical (Slot semantics reproduced by useRender+mergeProps).

## Verify by hand

1. Kanban board (/dashboard/kanban): drag a card between columns (cards are
   asHandle — grab anywhere on the card); order persists.
2. Drag a column by its grip handle; the ghost overlay follows; drop reorders.
3. Keyboard: focus a card and use the dnd-kit keyboard sensor (space + arrows).
