# CLAUDE.md

This is a Next.js 16 + shadcn/ui admin dashboard starter kit.

## Key References

- **[AGENTS.md](./AGENTS.md)** — Full project overview, tech stack, structure, conventions, data fetching patterns, deployment
- **[docs/forms.md](./docs/forms.md)** — Form system: TanStack Form + Zod, composable fields, validation, multi-step, sheet/dialog forms
- **[docs/themes.md](./docs/themes.md)** — Theme system: OKLCH colors, adding themes, font config
- **[docs/nav-rbac.md](./docs/nav-rbac.md)** — Navigation RBAC: permission-based access control, nav filtering via `useMe()` + `useFilteredNavGroups()`

## Critical Conventions

- **React Query** for all data fetching — `void prefetchQuery()` on server + `useSuspenseQuery` on client (standard TanStack pattern), `useMutation` for forms, `HydrationBoundary` + `dehydrate` for hydration, `<Suspense fallback>` for streaming
- **API layer** per feature — `api/types.ts` → `api/service.ts` → `api/queries.ts`; queries use key factories (`entityKeys.all/list/detail`); components import from service and queries, never from mock APIs directly
- **nuqs** for URL search params — `searchParamsCache` on server, `useQueryStates` on client, use `getSortingStateParser` for sort (same parser as `useDataTable`)
- **Icons** — only import from `@/components/icons`, never from `@tabler/icons-react` directly
- **Forms** — use `useAppForm` + `useFormFields<T>()` from `@/components/ui/tanstack-form`
- **Page headers** — use `PageContainer` props (`pageTitle`, `pageDescription`, `pageHeaderAction`), never import `<Heading>` manually
- **i18n (中英双语)** — all user-facing strings must use `useTranslation()` (`const { t } = useTranslation()` from `@/lib/i18n`) with entries in BOTH `translations.en` and `translations.zh` in `src/lib/i18n.ts`. Never hardcode zh/en UI text in components. This covers **every user-visible prop, not just element children** — `placeholder`, `aria-label`/`title`, `tooltip`, and screen-reader-only labels (`DialogTitle`/`DialogDescription`/`SheetTitle`/`SheetDescription`, etc.) must all go through `t()`. Beware **defaults inherited from UI primitives or third-party components**: e.g. `<KBarSearch>` renders a hardcoded English `"Type a command or search…"` unless you pass `placeholder={t('...')}`, and shadcn `CommandDialog` ships default English `title`/`description` props — always pass an explicit `t()` value instead of relying on the library default. Command palette / search entries must also be grouped by their nav-group label (`数字员工` / `系统设置` …) via `t(group.label)` so they mirror the sidebar. Default language is `zh`; the key (usually the English string, e.g. `t('Users')`) must exist in both dictionaries
- **Formatting** — single quotes, JSX single quotes, no trailing comma, 2-space indent
