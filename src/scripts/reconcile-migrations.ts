import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db';

// One-time reconciliation for a DB whose tables already exist (e.g. created via
// `drizzle-kit push` or direct SQL) but which has no drizzle migration tracker.
// Marks every on-disk migration as applied WITHOUT executing its SQL, so the
// next `migrate()` is a no-op and future generated migrations apply cleanly.
//
//   pnpm db:reconcile     # only ever needed once, on a push-managed DB

async function reconcile() {
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
  console.log(`[reconcile] ${migrations.length} migration(s) found on disk`);

  // drizzle keeps its tracker in the `drizzle` schema by default.
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const result = await db.execute(sql`SELECT hash FROM "drizzle"."__drizzle_migrations"`);
  const seen = new Set<string>((result as unknown as Array<{ hash: string }>).map((r) => r.hash));

  for (const m of migrations) {
    if (seen.has(m.hash)) {
      console.log(`[reconcile] already tracked, skip: ${m.hash.slice(0, 12)}…`);
      continue;
    }
    await db.execute(sql`
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      VALUES (${m.hash}, ${m.folderMillis})
    `);
    console.log(`[reconcile] marked applied: ${m.hash.slice(0, 12)}… (ts=${m.folderMillis})`);
  }
  console.log('[reconcile] done');
}

reconcile()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`[reconcile] failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
