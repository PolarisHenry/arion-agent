# alert-dialog

2026-07-03, transformation engine (legacy style `new-york` — classification against the
`new-york-v4` golden showed an older stock vintage with no user customizations, so no
replay; the user's own file was rewired, keeping its exact classes). Migrated cleanly:
typecheck and full `next build` pass, matching the clean baseline.

## Changed

- `src/components/ui/alert-dialog.tsx` — rewired from `@radix-ui/react-alert-dialog`
  to `@base-ui/react/alert-dialog`:
  - Import: `* as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'` →
    `{ AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'` (line 4).
  - Part renames: `Overlay` → `Backdrop` (line 23), `Content` → `Popup` (line 37,
    centered modal — no Positioner), `Cancel` → `Close` (line 102). Public export names
    unchanged; `data-slot` attributes kept exactly where the radix wrapper had them.
  - `AlertDialogAction` → plain `<button>` with `buttonVariants()` (line 97); Base UI
    has no Action primitive (see Behavior changes).
  - Prop types: `React.ComponentProps<typeof AlertDialogPrimitive.X>` →
    `AlertDialogPrimitive.X.Props` (Title/Description keep the `ComponentProps` form,
    matching the base registry idiom).
  - Class rewrites (mechanical, user's visual classes untouched):
    `data-[state=open]:` → `data-open:`, `data-[state=closed]:` → `data-closed:` on
    Backdrop (line 26) and Popup (line 41). The `animate-in`/`animate-out` idiom is
    kept, keyed to the new attributes — same idiom the shadcn base registry uses for
    alert-dialog.
- `package.json` / `bun.lock` — added `@base-ui/react@1.6.0` (installed with bun, the
  project's package manager). Radix packages intentionally NOT removed; they are
  removed only after the last component migrates.

Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/components/ui/alert-dialog.tsx`
returns nothing.

Consumer sweep: no file in `src/` imports `@/components/ui/alert-dialog` or references
`AlertDialog*` outside the wrapper itself — zero consumers to repoint.

Note: the git tree had pre-existing unrelated changes (`.agents/`, `.claude/skills/`,
`plans/`, `skills-lock.json`); the migration commit stages only its own files.

## Left alone

- `src/components/ui/dialog.tsx`, `sheet.tsx` — same primitive family but separate
  components; not requested in this run.
- `buttonVariants` import from `@/components/ui/button` — button.tsx is still on radix
  (Slot), but alert-dialog only consumes its cva class factory, which is
  primitive-agnostic; the base registry's alert-dialog has the same dependency shape.
- `src/components/ui/table/data-table-*.tsx` — match a radix grep but only import
  `@radix-ui/react-icons` (icon library, `iconLibrary: "radix"`), not primitives; not a
  migration target.
- Registry drift NOT adopted: the current v4/base registries added `AlertDialogMedia`,
  `size` props, and Button-composed Action/Cancel. The user's file predates that drift;
  per legacy-style rules their shape and look stay theirs.

## Behavior changes

- **AlertDialogAction no longer closes the dialog.** Radix `Action` closed on click;
  Base UI has no Action primitive, and the wrapper now renders a plain button (the
  shadcn base registry does the same). Consumers must close via controlled
  `open`/`onOpenChange`, `actionsRef.current.close()`, or by composing
  `AlertDialogCancel`/`Close` semantics. No consumers exist today, so nothing breaks
  now — but future call sites must handle this.
- **Initial focus target.** Radix alert-dialog focuses the Cancel button on open; Base
  UI focuses the first tabbable element in the popup. Preserve the old behavior with
  `initialFocus={cancelRef}` on the Popup if wanted. Flagged, not patched.
- **`onOpenChange` signature** gains a second `eventDetails` argument
  (`(open, eventDetails) => void`). Radix-era `(open) => ...` handlers stay compatible.
  Per-interaction callbacks (`onEscapeKeyDown` etc.) no longer exist as props; use
  `eventDetails.reason` + `eventDetails.cancel()`.
- **Portal renders a wrapper `<div>`** in Base UI (radix rendered nothing extra).
  Cosmetic DOM difference; no styles target it here.

## Verify by hand

1. Drop a quick `<AlertDialog>` with Trigger/Content/Cancel/Action into any dashboard
   page (there are no existing usages to test).
2. Open it: backdrop fades in, panel fades/zooms in centered; Escape closes it and
   focus returns to the trigger.
3. Click outside the panel: it must NOT close (alert-dialog is always modal).
4. Tab through: focus stays trapped inside; note which element gets focus on open
   (first tabbable, not Cancel — see Behavior changes).
5. Click Cancel: closes. Click Action: runs onClick but does NOT close by itself —
   confirm your call site closes it explicitly.
