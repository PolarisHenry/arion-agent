import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  index,
  boolean,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

// ============================================================
// Auth tables (Better Auth core)
// ============================================================

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Master-sub-account: null = master, else = master's user.id
    ownerId: text('owner_id'),
    // FK → role.id; 'owner' for master accounts, custom role for sub-accounts
    roleId: text('role_id').notNull().default('owner'),
    // Whether this account is enabled (master + sub-accounts)
    enabled: boolean('enabled').default(true).notNull()
  },
  (table) => [
    index('user_ownerId_idx').on(table.ownerId),
    index('user_roleId_idx').on(table.roleId)
  ]
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { mode: 'date', precision: 3 }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
  },
  (table) => [index('session_userId_idx').on(table.userId)]
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date', precision: 3 }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date', precision: 3 }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [index('account_userId_idx').on(table.userId)]
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', precision: 3 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)]
);

// ============================================================
// RBAC: Role table
// ============================================================

export const role = pgTable(
  'role',
  {
    id: text('id').primaryKey(),
    // null = system role (Owner); otherwise = master account id that owns this custom role
    ownerId: text('owner_id'),
    name: text('name').notNull(),
    description: text('description'),
    permissions: text('permissions')
      .array()
      .notNull()
      .default([] as any),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [
    index('role_ownerId_idx').on(table.ownerId),
    uniqueIndex('role_ownerId_name_uidx').on(table.ownerId, table.name)
  ]
);

// ============================================================
// Business table: Product
// ============================================================

export const product = pgTable(
  'product',
  {
    id: text('id').primaryKey(),
    // owner_id = master account id (tenant isolation)
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    category: text('category').default(''),
    price: integer('price').default(0),
    description: text('description').default(''),
    status: text('status').default('active'),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull()
  },
  (table) => [index('product_ownerId_idx').on(table.ownerId)]
);

// ============================================================
// Relations
// ============================================================

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  // Self-reference: sub-accounts point to their master
  owner: one(user, {
    fields: [user.ownerId],
    references: [user.id],
    relationName: 'user_owner'
  }),
  subAccounts: many(user, { relationName: 'user_owner' }),
  role: one(role, {
    fields: [user.roleId],
    references: [role.id]
  }),
  ownedRoles: many(role, { relationName: 'role_owner' })
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id]
  })
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id]
  })
}));

export const roleRelations = relations(role, ({ one, many }) => ({
  owner: one(user, {
    fields: [role.ownerId],
    references: [user.id],
    relationName: 'role_owner'
  }),
  users: many(user)
}));
