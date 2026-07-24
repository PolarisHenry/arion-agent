import { runMigrations } from '../lib/migrate';

// Standalone entry for `pnpm db:migrate` — applies pending migrations without
// booting the worker. Prefer this over hand-running the SQL files so drizzle's
// __drizzle_migrations tracker stays in sync with the schema.
runMigrations()
  .then(() => {
    console.log('[migrate] done');
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error(`[migrate] failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
