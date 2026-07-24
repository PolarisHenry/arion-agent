import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/lib/auth-schema.ts', './src/lib/agent-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://arion:arion_dev@localhost:5432/arion_agent'
  }
});