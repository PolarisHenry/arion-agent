# dialog

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Overlay →
Backdrop, Content → Popup (centered modal, no Positioner). Typecheck clean.

## Changed

- `src/components/ui/dialog.tsx` — import → `@base-ui/react/dialog`; part renames +
  `.Props` types. Class renames `data-[state=*]` → `data-open`/`data-closed` on
  Backdrop and Popup (animate-in/out keyframe idiom kept, matching the base
  registry). The built-in Close button's `data-[state=open]:bg-accent
  data-[state=open]:text-muted-foreground` classes were DELETED — radix never set
  `data-state` on Close either, so they were already dead code; rendering is
  unchanged.
- `src/components/ui/command.tsx` — consumer fix: `CommandDialog` children type
  narrowed to `React.ReactNode` (Base UI Root's `children` union includes a payload
  render function, which broke passing them into `<Command>`).
- `src/features/kanban/components/new-task-dialog.tsx` — consumer fixes:
  `<DialogTrigger asChild><Button/>` → `render={<Button/>}`; the footer's second
  `<DialogTrigger asChild>` around the SUBMIT button (radix triggers toggle, so it
  closed the dialog on submit) → `<DialogClose render={<Button type='submit'
  form='task-form'/>}>` — Base UI Close preserves the close-on-submit behavior
  unambiguously. Import updated.
- `src/features/forms/components/sheet-form-demo.tsx` — `DialogTrigger asChild` →
  `render` (feedback dialog).

## Left alone

- `modal.tsx` — plain `open`/`onOpenChange` composition, no changes needed.
- `command.tsx`'s `DialogHeader` sitting OUTSIDE `DialogContent` — pre-existing
  quirk, behavior unchanged; not touched.

## Behavior changes

- `onOpenChange` gains eventDetails (single-arg handlers unaffected — modal.tsx,
  sheet-form-demo, user-form-sheet all single-arg).
- Radix per-interaction callbacks (`onEscapeKeyDown` etc.) no longer exist as
  props; no call sites used them.
- Base UI Portal renders a wrapper `<div>`; no styles target it.

## Verify by hand

1. Kanban board: ➕ Add New Task — dialog opens, backdrop fades, panel zooms;
   submit "Add Task" adds the task AND closes the dialog; Escape closes; focus
   returns to the trigger.
2. Forms → feedback dialog: open/close via trigger and X button.
