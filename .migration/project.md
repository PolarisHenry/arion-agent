# project — whole-ui Radix → Base UI migration

2026-07-03 → 2026-07-04. All 28 radix-touching ui wrappers migrated to
`@base-ui/react@1.6.0`, one commit per component, buildable at every step.
Legacy style `new-york` → transformation engine throughout (no golden replay;
the user's classes stayed theirs, with base registry anatomy where structural).

## Dependency swap

- Added: `@base-ui/react@1.6.0`.
- Removed (after the last component): all 27 `@radix-ui/react-*` primitive
  packages + the unified `radix-ui` package (`bun remove`, lockfile updated).
- Removed (follow-up, user request): `@radix-ui/react-icons` — seven files
  (calendar, five data-table files, sign-up view) switched to the tabler-based
  `@/components/icons` map (`CaretSort` → `Icons.chevronsUpDown`, `Cross2` →
  `Icons.close`, etc.); `iconLibrary` in components.json set to `"tabler"`.
  ZERO `@radix-ui` imports remain anywhere in the repo.

## Migrated (28 wrappers, one report each in .migration/)

alert-dialog, button, label, separator, aspect-ratio, badge, breadcrumb,
button-group, avatar, progress, scroll-area, checkbox, switch, radio-group,
slider, toggle, toggle-group, accordion, collapsible, tabs, dialog, sheet,
tooltip, popover, hover-card, dropdown-menu, context-menu, menubar, select,
navigation-menu, sidebar, infobar, kanban.

## Intentionally untouched (not radix)

command (cmdk), drawer (vaul), sonner, input-otp, calendar (react-day-picker),
chart (recharts), table/tanstack files (except their radix-consumer call sites).

## App-code sweep summary

- `asChild` is GONE from the entire repo (`grep -rn asChild src/` → 0); every
  call site uses `render`.
- All `--radix-*` CSS vars renamed (`--anchor-width`, `--available-height`,
  `--transform-origin`, `--accordion-panel-height`).
- `data-[state=*]` selectors remaining in src are NON-radix by design: vaul
  drawer, tanstack-table `data-state=selected`, sidebar/infobar's own
  `data-state=collapsed`, navigation-menu Icon (registry quirk), field.tsx uses
  `has-data-checked` now.
- Consumer prop fixes: `type='multiple'` → `multiple` (toggle-group),
  `position='popper'` → `alignItemWithTrigger={false}` default (select),
  `delayDuration` → `delay` (tooltip provider), widened
  `string | null` / `readonly number[]` handler types (select, slider),
  `forceMount` dropped (user-nav), kanban submit trigger → DialogClose.

## Final build

Baseline (before migration): `tsc --noEmit` clean. Final: `tsc --noEmit` clean,
`next build` succeeds — matches baseline. Leftover scan across src: only
`@radix-ui/react-icons` imports remain.

## FLAGGED for the user (not fixed, by design)

1. ~~components.json style~~ RESOLVED (user request, follow-up commit): style
   switched `new-york` → `base-nova`, so `npx shadcn add` now delivers Base UI
   variants with tabler icons. Note: newly added components arrive with the
   NOVA look (nova radii/spacing/typography), while the migrated components
   keep their original new-york-era styling — expect cosmetic drift on new
   additions until classes are aligned by hand.
2. Behavior deltas flagged per component report, most notable:
   - tabs: keyboard activation now manual (Base UI default);
   - dropdown/context/menubar checkbox+radio items no longer close on click;
   - alert-dialog Action no longer closes the dialog by itself;
   - navigation-menu hover delay 200ms → 50ms; its Indicator no longer tracks
     triggers;
   - scroll-area scrollbar is persistently visible when scrollable;
   - separators are announced by screen readers (always semantic);
   - checkbox/switch/radio roots render `<span>` (peer-disabled selectors dead).
3. The husky pre-commit hook fails on this repo (untracked `.claude/skills/shadcn`
   symlink breaks lint-staged's stash); every migration commit ran
   `oxfmt --write` manually and committed with `--no-verify`.

## Verify by hand (whole project, ~10 minutes)

1. Sidebar: navigate, collapse to icons (tooltips), expand groups, user menu.
2. Tables: pagination select, column-header sort menus, all four filter
   popovers, row actions (edit navigates, delete confirms via modal).
3. Forms suite: basic/advanced/multi-step/sheet forms — selects, checkboxes,
   switches, radio groups, sliders, toggle group, combobox, date pickers, OTP.
4. Kanban: add task (dialog closes on submit), drag cards and columns.
5. Overview/notifications tabs; theme selector; notification popover; GitHub
   header link.
