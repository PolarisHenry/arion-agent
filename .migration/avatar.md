# avatar

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Direct
1:1 mapping (Root/Image/Fallback keep their names). Typecheck clean.

## Changed

- `src/components/ui/avatar.tsx` — import `@radix-ui/react-avatar` →
  `@base-ui/react/avatar`; prop types → `AvatarPrimitive.{Root,Image,Fallback}.Props`.
  Classes and structure untouched. Leftover scan clean.

## Left alone

- All consumers (user-nav, nav-user, chat, notifications…) — plain
  `src`/`className`/children usage; no `delayMs` (→ `delay`) or
  `onLoadingStatusChange` call sites existed.

## Behavior changes

None observable. (Base Root renders `<span>` like radix; fallback timing default
unchanged.)

## Verify by hand

1. Header user menu + sidebar footer: avatar image loads; sign out/in with a user
   without an image to see the initials fallback.
