// ============================================================
// DB client for Worker — mirrors src/lib/db.ts patterns but
// stands alone so the Worker doesn't import the Next.js app.
// ============================================================

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from '../lib/auth-schema';
import * as agentSchema from '../lib/agent-schema';
import { config } from './config';

const client = postgres(config.databaseUrl, { max: 5 });

export const workerDb = drizzle(client, { schema: { ...authSchema, ...agentSchema } });
export { authSchema, agentSchema };
