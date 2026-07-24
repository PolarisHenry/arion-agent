import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from './auth-schema';
import * as agentSchema from './agent-schema';

const databaseUrl = process.env.DATABASE_URL || 'postgres://arion:arion_dev@db:5432/arion_agent';

const client = postgres(databaseUrl, { max: 10 });

export const db = drizzle(client, { schema: { ...authSchema, ...agentSchema } });
