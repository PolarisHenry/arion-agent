# aspect-ratio

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Base UI
has NO AspectRatio primitive — replaced with a plain div + CSS `aspect-ratio` via a
`--ratio` variable, matching the shadcn base registry shape. Typecheck clean.

## Changed

- `src/components/ui/aspect-ratio.tsx` — `@radix-ui/react-aspect-ratio` Root →
  `<div>` with `style={{'--ratio': ratio}}` and `relative aspect-(--ratio)` classes
  (Tailwind v4 var shorthand). `ratio` prop kept with radix's default of `1` (the
  base registry makes it required; kept optional to preserve the radix-era API since
  the registry has no `-lyra` counterpart for this project's legacy style).
  Leftover scan clean.

## Left alone

- No consumers exist anywhere in `src/` — the component is installed but unused.

## Behavior changes

- Radix AspectRatio absolutely-positioned its children to fill the box (internal
  wrapper div); the CSS version lets children flow normally. Future call sites
  should size children themselves (`h-full w-full object-cover` on media), same as
  the shadcn base registry examples. No consumers today, so nothing breaks.

## Verify by hand

1. No usages to test. If adopting it later: `<AspectRatio ratio={16/9}><img
   className='h-full w-full rounded-md object-cover'/></AspectRatio>` renders a
   16:9 box.
