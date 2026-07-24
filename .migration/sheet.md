# sheet

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper — sheet is
the Dialog primitive with slide styling). Overlay → Backdrop, Content → Popup; slide
animations restated as transitions. Typecheck clean.

## Changed

- `src/components/ui/sheet.tsx` — import `@radix-ui/react-dialog` →
  `@base-ui/react/dialog`; part renames + `.Props` types. Slide animations restated
  per the skill idiom: `data-[state=open]:animate-in/slide-in-from-*` keyframes →
  `transition` + `data-starting-style:*`/`data-ending-style:*` translate per side
  (FULL-width slide preserved — the base registry uses a 2.5rem partial slide, but
  the user's look stays theirs per the legacy-style rule). The user's asymmetric
  durations kept as `data-open:duration-500` / `data-closed:duration-300`. Close
  button's dead `data-[state=open]:bg-secondary` deleted (same rationale as
  dialog). Backdrop keeps the fade keyframe idiom.
- `src/features/forms/components/sheet-form-demo.tsx` and
  `src/features/forms/components/sheet-product-form.tsx` — consumer fixes:
  `<SheetTrigger asChild><Button/>` → `render={<Button/>}` (children hoisted).

## Left alone

- `sidebar.tsx` / `infobar.tsx` mobile Sheets — plain `open/onOpenChange/side/
  className` composition; `[&>button]:hidden` still hides the built-in close
  button. These files migrate their own radix usage in the compositions run.
- `user-form-sheet.tsx` — controlled sheet without asChild; unchanged.
- `drawer.tsx` (vaul) — NOT radix; untouched per hard rule.

## Behavior changes

- Slide is now a CSS transition instead of a keyframe animation — visually
  equivalent (same directions, durations, easing), but custom keyframe overrides
  passed via className would no longer compose.

## Verify by hand

1. Forms → sheet form demo: sheet slides in from the right over 500ms, slides out
   over 300ms; Escape and X close it.
2. Mobile viewport: sidebar opens as a left sheet; infobar as right sheet.
3. Users page: edit-user sheet opens/closes with form intact.
