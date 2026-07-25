import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================
// LLM Model — OpenAI-compatible model config (tenant-scoped)
// ============================================================

export const llmModel = pgTable(
  'llm_model',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    baseUrl: text('base_url').notNull(),
    apiKeyCipher: text('api_key_cipher').notNull(),
    modelName: text('model_name').notNull(),
    temperature: real('temperature').default(0.7),
    maxTokens: integer('max_tokens').default(8192),
    // Optional per-model override of the agent-loop cumulative token budget.
    // Null → fall back to the global default.
    loopMaxTokens: integer('loop_max_tokens'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('llm_model_ownerId_idx').on(table.ownerId),
    uniqueIndex('llm_model_ownerId_name_uidx').on(table.ownerId, table.name)
  ]
);

// ============================================================
// Agent — Feishu digital employee (tenant-scoped)
// ============================================================

export const agent = pgTable(
  'agent',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    avatar: text('avatar'),
    appId: text('app_id').notNull(),
    appSecretCipher: text('app_secret_cipher').notNull(),
    larkCliProfile: text('lark_cli_profile').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    llmModelId: text('llm_model_id')
      .notNull()
      .references(() => llmModel.id),
    status: text('status').notNull().default('active'),
    configVersion: integer('config_version').default(1).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('agent_ownerId_idx').on(table.ownerId),
    uniqueIndex('agent_ownerId_name_uidx').on(table.ownerId, table.name)
  ]
);

// ============================================================
// Relations
// ============================================================

export const llmModelRelations = relations(llmModel, ({ many }) => ({
  agents: many(agent)
}));

export const agentRelations = relations(agent, ({ one, many }) => ({
  llmModel: one(llmModel, {
    fields: [agent.llmModelId],
    references: [llmModel.id]
  }),
  userAuth: many(agentUserAuth),
  retryQueue: many(agentRetryQueue),
  memory: many(agentMemory)
}));

// ============================================================
// Agent Session — conversation memory per (agent, chatId)
// ============================================================

export const agentSession = pgTable(
  'agent_session',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').notNull(),
    chatType: text('chat_type').notNull(),
    messages: jsonb('messages').notNull().default([]),
    lastActiveAt: timestamp('last_active_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('agent_session_agentId_idx').on(table.agentId),
    index('agent_session_chatId_idx').on(table.chatId),
    uniqueIndex('agent_session_agentId_chatId_uidx').on(table.agentId, table.chatId)
  ]
);

// ============================================================
// Agent Memory — long-term KV facts per agent (survives /clear)
// ------------------------------------------------------------
// Explicit, agent-written facts (resource locations, IDs,
// preferences, recurring contacts) injected into the system prompt
// every turn. Separate from agent_session so /clear (which wipes
// session messages) does NOT touch it. Per-agent scoped — the agent
// binds to a single user identity, so per-agent ≈ "the owner's facts".
// UNIQUE(agent_id, key) makes `save` an upsert (dedup by key).
// ============================================================

export const agentMemory = pgTable(
  'agent_memory',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    label: text('label'),
    category: text('category'),
    note: text('note'),
    /** Importance tier for truncation priority. Top-50 inject keeps high first,
     *  then medium, then low; within each tier newest-first. Agent sets this via
     *  the `memory` tool's `importance` param. */
    importance: text('importance').notNull().default('medium'),
    /** Optional expiry. After this timestamp the fact is excluded from injection
     *  (though not auto-deleted — dashboard still shows it for audit). Agent sets
     *  this for time-bounded facts like "current sprint ends Friday". */
    expiresAt: timestamp('expires_at', { mode: 'date', precision: 3 }),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('agent_memory_agentId_idx').on(table.agentId),
    index('agent_memory_ownerId_idx').on(table.ownerId),
    uniqueIndex('agent_memory_agentId_key_uidx').on(table.agentId, table.key)
  ]
);

// ============================================================
// Agent Trigger — scheduled proactive tasks
// ============================================================

export const agentTrigger = pgTable(
  'agent_trigger',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cron: text('cron').notNull(),
    prompt: text('prompt').notNull(),
    targetChatId: text('target_chat_id'),
    enabled: boolean('enabled').default(true).notNull(),
    /** Only fire on Chinese workdays: skip statutory holidays, still fire on
     *  调休 make-up days. The scheduler rewrites the cron to daily and filters
     *  via isChineseWorkday(), so a `0 9 * * 1-5` becomes "every Chinese
     *  workday at 09:00" rather than a blind Mon–Fri. */
    workdaysOnly: boolean('workdays_only').default(false).notNull(),
    lastRunAt: timestamp('last_run_at', { mode: 'date', precision: 3 }),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [index('agent_trigger_agentId_idx').on(table.agentId)]
);

// ============================================================
// Agent Log — runtime execution log
// ============================================================

export const agentLog = pgTable(
  'agent_log',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    chatId: text('chat_id'),
    type: text('type').notNull(),
    messageContent: text('message_content'),
    responseContent: text('response_content'),
    toolCalls: jsonb('tool_calls'),
    tokensUsed: integer('tokens_used'),
    durationMs: integer('duration_ms'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    // Why the agent loop stopped this turn: final / token-budget / timeout /
    // repetition / error-streak / round-ceiling. Null on the error path (the
    // loop never returned) and on rows written before this column existed.
    stopReason: text('stop_reason'),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    index('agent_log_agentId_idx').on(table.agentId),
    index('agent_log_createdAt_idx').on(table.createdAt)
  ]
);

// ============================================================
// Agent User Auth — user OAuth device flow state per agent
// ------------------------------------------------------------
// Tracks the OAuth device flow lifecycle. Tokens themselves are
// stored by lark-cli in its config files (volume-mounted), NOT in DB.
// This table only holds the auth state machine + metadata.
// ============================================================

export const agentUserAuth = pgTable(
  'agent_user_auth',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending_start'),
    deviceCode: text('device_code'),
    verificationUrl: text('verification_url'),
    userOpenId: text('user_open_id'),
    userName: text('user_name'),
    grantedScopes: jsonb('granted_scopes'),
    tokenExpiresAt: timestamp('token_expires_at', { mode: 'date', withTimezone: true }),
    errorMsg: text('error_msg'),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('agent_user_auth_agentId_idx').on(table.agentId),
    index('agent_user_auth_status_idx').on(table.status)
  ]
);

// ============================================================
// Agent Retry Queue — pending replay tasks after incremental auth
// ------------------------------------------------------------
// When a user-identity call comes back missing_scope, we kick off an
// incremental device flow AND record the failed call here. When the
// AuthManager's poller sees the flow complete (token gained the scope),
// it triggers a replay of the failed operation via proactive-runner.
// ============================================================

export const agentRetryQueue = pgTable(
  'agent_retry_queue',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.id, { onDelete: 'cascade' }),
    chatId: text('chat_id'),
    chatType: text('chat_type'),
    failedArgv: jsonb('failed_argv'),
    pendingScopes: jsonb('pending_scopes').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    index('agent_retry_queue_agentId_idx').on(table.agentId),
    index('agent_retry_queue_status_idx').on(table.status)
  ]
);

// ============================================================
// Relations for session / trigger / log / userAuth / retryQueue
// ============================================================

export const agentSessionRelations = relations(agentSession, ({ one }) => ({
  agent: one(agent, {
    fields: [agentSession.agentId],
    references: [agent.id]
  })
}));

export const agentTriggerRelations = relations(agentTrigger, ({ one }) => ({
  agent: one(agent, {
    fields: [agentTrigger.agentId],
    references: [agent.id]
  })
}));

export const agentLogRelations = relations(agentLog, ({ one }) => ({
  agent: one(agent, {
    fields: [agentLog.agentId],
    references: [agent.id]
  })
}));

export const agentUserAuthRelations = relations(agentUserAuth, ({ one }) => ({
  agent: one(agent, {
    fields: [agentUserAuth.agentId],
    references: [agent.id]
  })
}));

export const agentRetryQueueRelations = relations(agentRetryQueue, ({ one }) => ({
  agent: one(agent, {
    fields: [agentRetryQueue.agentId],
    references: [agent.id]
  })
}));

export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
  agent: one(agent, {
    fields: [agentMemory.agentId],
    references: [agent.id]
  })
}));
