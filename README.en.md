# Arion Agent

[中文](./README.md)

AI Digital Employee Admin Platform — manage Agents, scheduled tasks, LLM models, users, and role permissions from a single Dashboard. Once configured, a background Worker drives these Agents to run in Feishu (Lark) and converse with users in real time.

## Architecture

```
Dashboard (Next.js 16)          Worker (tsx)
┌─────────────────────┐         ┌──────────────────────┐
│  Agent management   │         │  AgentManager         │
│  LLM model config   │  ──DB── │  Session management   │
│  Triggers / cron    │         │  Trigger scheduling   │
│  Roles & RBAC       │         │  Lark Channel links   │
└─────────────────────┘         └──────────────────────┘
```

- **Dashboard** — configure Agents, models, and triggers; manage users and permissions
- **Worker** (`pnpm worker`) — background process that reads config from the DB and drives Agents to converse with users over a Lark Channel

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | Better Auth (email/password) |
| Database | PostgreSQL + Drizzle ORM |
| Data fetching | TanStack React Query |
| Forms | TanStack Form + Zod |
| Tables | TanStack Table + nuqs (URL state) |
| Charts | Recharts |
| Feishu | lark-cli + @larksuite/channel |
| Worker | tsx (runtime) |
| Error tracking | Sentry (off by default) |
| Encryption | AES-256-GCM (Feishu secrets / LLM API keys) |

## Features

- **Agent management** — create/edit digital employees; configure persona, model, and Feishu channel
- **Scheduled tasks** — trigger Agents on a schedule or manually
- **LLM model config** — manage multiple providers; API keys encrypted at rest
- **Users & roles (RBAC)** — master/sub-account model with permission-based menu filtering
- **Feishu integration** — Agents interact with users in Feishu via a Lark Channel
- **Background Worker** — reads config from the DB and runs the Agents
- **Bilingual (zh/en)** — every UI string switches between Chinese and English

## Quick Start

### Prerequisites

- Node.js >= 22
- pnpm >= 10
- PostgreSQL

### Install & Run

```bash
pnpm install
cp .env.example .env
# edit .env with the required values
pnpm dev          # start the Dashboard (http://localhost:3000)
```

### Start the Worker

```bash
pnpm worker       # background Agent process
```

### Environment Variables

See `.env.example`. Core variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Session encryption secret (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | Auth callback URL (`http://localhost:3000` locally) |
| `SECRET_ENCRYPTION_KEY` | AES-256 key for encrypting the Feishu appSecret / LLM API keys |
| `NEXT_PUBLIC_APP_TIMEZONE` | Display timezone across the app; defaults to `Asia/Shanghai` |
| `NEXT_PUBLIC_SENTRY_DISABLED` | Disable Sentry; defaults to `"true"` |

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── auth/                     # login / register
│   ├── dashboard/                # Dashboard pages
│   │   ├── agents/               # Agent management
│   │   ├── triggers/             # trigger management
│   │   ├── llm-models/           # LLM model config
│   │   ├── roles/                # role / permission management
│   │   ├── users/                # user management
│   │   ├── chat/                 # chat UI
│   │   └── ...
│   └── api/                      # API routes
│
├── features/                     # feature modules
│   ├── agents/                   # Agent CRUD
│   ├── agent-auth/               # Feishu authorization
│   ├── agent-triggers/           # triggers
│   ├── llm-models/               # model config
│   ├── users/                    # user management
│   └── ...
│
├── worker/                       # background Worker
│   ├── index.ts                  # entry point
│   ├── agent-manager.ts          # Agent lifecycle
│   ├── session/                  # session management
│   └── trigger/                  # trigger scheduling
│
├── lib/                          # shared libraries
│   ├── auth.ts                   # Better Auth config
│   ├── auth-schema.ts            # auth table schema (Drizzle)
│   ├── agent-schema.ts           # Agent table schema (Drizzle)
│   ├── crypto.ts                 # AES-256 encryption
│   ├── db.ts                     # Drizzle client
│   └── rbac/                     # permission checks
│
├── drizzle/                      # database migrations
└── docs/                         # documentation
```

## Common Commands

```bash
pnpm dev           # dev server
pnpm build         # production build
pnpm worker        # start the Worker
pnpm lint          # Oxlint
pnpm format        # Oxfmt
pnpm test          # Vitest
```

## Code Conventions

- **React Query** data fetching — `void prefetchQuery()` on the server + `useSuspenseQuery` on the client
- **API layer** — `api/types.ts` → `api/service.ts` → `api/queries.ts`
- **nuqs** — URL search-param state
- **Icons** — import only from `@/components/icons`, never directly from `@tabler/icons-react`
- **Forms** — `useAppForm` + `useFormFields<T>()`
- **Page headers** — use `PageContainer` props, not `<Heading>`
- **i18n** — all user-visible text via `useTranslation()`, zh/en bilingual
- **Formatting** — single quotes, no trailing commas, 2-space indent

See [CLAUDE.md](./CLAUDE.md) and [AGENTS.md](./AGENTS.md).

## Credits

This project is built on top of [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter). Thanks to the upstream project for the open-source foundation. Licensed under [MIT](./LICENSE), inherited from upstream.
