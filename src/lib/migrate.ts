import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';

// Applies pending migrations from ./drizzle. Idempotent: drizzle records every
// applied migration in the `__drizzle_migrations` table, so re-running when the
// schema is already current is a no-op.
export async function runMigrations() {
  console.log('[migrate] applying pending migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[migrate] database is up to date');
}
