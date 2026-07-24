# scroll-area

2026-07-04, transformation engine (legacy style `new-york`; stock wrapper). Part
renames only — the base registry keeps the identical anatomy (no Content part,
no visibility restyling). Typecheck clean.

## Changed

- `src/components/ui/scroll-area.tsx` — import → `@base-ui/react/scroll-area`;
  `ScrollAreaScrollbar` → `Scrollbar`, `ScrollAreaThumb` → `Thumb`; prop types →
  `.Props` forms. Added explicit `data-orientation={orientation}` on the Scrollbar
  (registry idiom; the JS-conditional orientation classes are kept exactly as the
  user had them). Viewport/Corner/classes untouched. Leftover scan clean.

## Left alone

- Consumers (data-table, notification-center, file-uploader) — none pass `type`,
  `scrollHideDelay`, or `dir` (all dropped in Base UI), so no call-site changes.

## Behavior changes

- **Scrollbar visibility.** Radix `type="hover"` (default) hid the scrollbar until
  hover; Base UI mounts the scrollbar whenever content is scrollable, so it is
  persistently visible. The shadcn base registry accepts this default; to restore
  hover-only visibility, style opacity against `data-hovering`/`data-scrolling` on
  the Scrollbar. Flagged, not patched.

## Verify by hand

1. Data table with many columns: horizontal scrollbar drags correctly; corner
   renders where the two scrollbars meet.
2. Notification center: vertical wheel + thumb drag scroll; keyboard focus ring on
   the viewport (Tab into it).
