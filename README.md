# Arion Agent

[English](./README.en.md)

![Arion Agent](./public/cn.png)

AI 数字员工管理后台（Admin Platform）—— 在 Dashboard 上统一管理 Agent、定时任务、LLM 模型、用户与角色权限；配置完成后由后台 Worker 驱动这些 Agent 在飞书中运行，与用户实时对话。

## 架构

```
Dashboard (Next.js 16)          Worker (tsx)
┌─────────────────────┐         ┌──────────────────────┐
│  Agent 管理           │         │  AgentManager         │
│  LLM 模型配置         │  ──DB── │  Session 管理         │
│  触发器 / 定时任务     │         │  Trigger 调度         │
│  角色权限 (RBAC)      │         │  Lark Channel 连接    │
└─────────────────────┘         └──────────────────────┘
```

- **Dashboard** — 配置 Agent、模型、触发器，管理用户和权限
- **Worker** (`pnpm worker`) — 后台进程，从 DB 读取配置，通过 Lark Channel 驱动 Agent 与用户对话

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) + React 19 |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 认证 | Better Auth (email/password) |
| 数据库 | PostgreSQL + Drizzle ORM |
| 数据获取 | TanStack React Query |
| 表单 | TanStack Form + Zod |
| 表格 | TanStack Table + nuqs (URL state) |
| 图表 | Recharts |
| 飞书 | lark-cli + @larksuite/channel |
| Worker | tsx (运行时) |
| 错误追踪 | Sentry (默认关闭) |
| 加密 | AES-256-GCM (飞书密钥 / LLM API Key) |

## 功能

- **Agent 管理** — 创建/编辑数字员工，配置人设、模型、飞书通道
- **定时任务** — 定时 / 手动触发 Agent 运行
- **LLM 模型配置** — 管理多个模型提供商，API Key 加密存储
- **用户与角色 (RBAC)** — 主账号/子账号，基于权限的菜单过滤
- **飞书集成** — Agent 经 Lark Channel 在飞书中与用户交互
- **后台 Worker** — 从 DB 读取配置，驱动 Agent 实际运行
- **中英双语** — 所有 UI 文本支持 zh/en 切换

## 快速开始

### 环境要求

- Node.js >= 22
- pnpm >= 10
- PostgreSQL

### 安装运行

```bash
pnpm install
cp .env.example .env
# 编辑 .env 填入必要的配置
pnpm dev          # 启动 Dashboard (http://localhost:3000)
```

### 启动 Worker

```bash
pnpm worker       # 后台 Agent 进程
```

### 环境变量

参见 `.env.example`，核心变量：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `BETTER_AUTH_SECRET` | 会话加密密钥 (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | 认证回调地址 (本地 `http://localhost:3000`) |
| `SECRET_ENCRYPTION_KEY` | AES-256 密钥，加密飞书 appSecret / LLM API Key |
| `NEXT_PUBLIC_APP_TIMEZONE` | 全站展示时区，默认 `Asia/Shanghai` |
| `NEXT_PUBLIC_SENTRY_DISABLED` | 关闭 Sentry，默认 `"true"` |

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── auth/                     # 登录/注册
│   ├── dashboard/                # Dashboard 页面
│   │   ├── agents/               # Agent 管理
│   │   ├── triggers/             # 触发器管理
│   │   ├── llm-models/           # LLM 模型配置
│   │   ├── roles/                # 角色权限管理
│   │   ├── users/                # 用户管理
│   │   ├── chat/                 # 对话界面
│   │   └── ...
│   └── api/                      # API 路由
│
├── features/                     # 功能模块
│   ├── agents/                   # Agent CRUD
│   ├── agent-auth/               # 飞书授权
│   ├── agent-triggers/           # 触发器
│   ├── llm-models/               # 模型配置
│   ├── users/                    # 用户管理
│   └── ...
│
├── worker/                       # 后台 Worker
│   ├── index.ts                  # 入口
│   ├── agent-manager.ts          # Agent 生命周期
│   ├── session/                  # 会话管理
│   └── trigger/                  # 触发器调度
│
├── lib/                          # 共享库
│   ├── auth.ts                   # Better Auth 配置
│   ├── auth-schema.ts            # 认证表结构 (Drizzle)
│   ├── agent-schema.ts           # Agent 表结构 (Drizzle)
│   ├── crypto.ts                 # AES-256 加密
│   ├── db.ts                     # Drizzle 客户端
│   └── rbac/                     # 权限检查
│
├── drizzle/                      # 数据库迁移文件
└── docs/                         # 文档
```

## 常用命令

```bash
pnpm dev           # 开发服务器
pnpm build         # 生产构建
pnpm worker        # 启动 Worker
pnpm lint          # Oxlint 检查
pnpm format        # Oxfmt 格式化
pnpm test          # Vitest 测试
```

## 代码约定

- **React Query** 数据获取 — `void prefetchQuery()` server 端 + `useSuspenseQuery` client 端
- **API 层** — `api/types.ts` → `api/service.ts` → `api/queries.ts`
- **nuqs** — URL search params 状态管理
- **图标** — 统一从 `@/components/icons` 导入，不直接引 `@tabler/icons-react`
- **表单** — `useAppForm` + `useFormFields<T>()`
- **页面头** — 使用 `PageContainer` props，不用 `<Heading>`
- **i18n** — 所有用户可见文本用 `useTranslation()`，zh/en 双语
- **格式化** — 单引号、无尾逗号、2 空格缩进

详见 [CLAUDE.md](./CLAUDE.md) 和 [AGENTS.md](./AGENTS.md)。

## 致谢

本项目基于 [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) 改造而来，感谢上游项目的开源贡献。License 沿用上游 [MIT](./LICENSE)。
