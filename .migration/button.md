# button

2026-07-04, transformation engine (legacy style `new-york`; wrapper is customized with
an `isLoading` spinner branch — customization preserved). Migrated to the REAL
`@base-ui/react/button` primitive per the hard rule. Typecheck clean.

FIX 2026-07-11 (code review, docs-only): Base UI's useButton injects
type='button' when type is omitted, so a bare <Button> inside a <form> no longer
submits (old plain <button> defaulted to submit). No live call site relies on
implicit submit; documented in docs/forms.md (use form.SubmitButton or
type='submit').

## Changed

- `src/components/ui/button.tsx` — `@radix-ui/react-slot` import and the
  `asChild ? Slot : 'button'` branch removed; both render paths now use
  `<ButtonPrimitive>` from `@base-ui/react/button` (line 2), which supports `render`
  natively. Props type: `React.ComponentProps<'button'> & {asChild?}` →
  `ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & {isLoading?}`
  (line 44). The user's `isLoading` grid-overlap spinner branch and all cva classes
  are untouched.
- `src/components/layout/cta-github.tsx` — the only `<Button asChild>` call site in
  the repo: `asChild + <a>` child → `render={<a …/>}` + `nativeButton={false}` with
  the icon as children (consumer-props.md universal rule).
- `src/components/ui/info-button.tsx` — consumer fix: `handleClick` was typed
  `(e: React.MouseEvent<HTMLButtonElement>)` and forwarded to `props.onClick`, which
  is now Base UI's `BaseUIEvent`-typed handler. Retyped as
  `React.ComponentProps<typeof Button>['onClick']` (line 32).

Leftover scan clean: `grep -n "radix-ui\|@radix-ui"` on all three files returns
nothing.

## Left alone

- `buttonVariants` cva definition — pure class factory, no primitive involvement.
- All `<SomeTrigger asChild><Button/></SomeTrigger>` call sites — `asChild` there
  belongs to the still-radix trigger wrappers (dropdown, popover, sheet, tooltip…);
  they compose fine with the new Button (it still renders a native `<button>`) and are
  repointed when their own component migrates.
- `spinner.tsx` — no radix content.

## Behavior changes

- `cta-github.tsx` link: with `nativeButton={false}` Base UI adds button-like keyboard
  semantics to the rendered `<a>` (Space activation, role wiring); radix Slot left it
  a plain anchor. Recommended by the reference tables; flagged here for awareness.
- Base UI Button events are `BaseUIEvent`-wrapped (adds `preventBaseUIHandler()`).
  Single-arg handlers keep working; only explicitly-typed forwarders needed retyping
  (info-button.tsx was the only one).

## Verify by hand

1. Any dashboard page: click a few buttons (primary, ghost, icon) — normal behavior.
2. Header GitHub icon link: opens repo in new tab; hover shows ghost style; Tab to it
   and press Enter (and note Space now also activates it).
3. A form submit button with loading (e.g. product form): spinner overlays without
   layout shift, button disabled while loading.
4. Info (ⓘ) buttons: click opens the infobar.
