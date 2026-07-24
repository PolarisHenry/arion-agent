import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { createLogger } from './logger';

const log = createLogger('retry-queue');

export type RetryRow = typeof agentSchema.agentRetryQueue.$inferSelect;

/** Enqueue a failed user-identity call awaiting incremental auth + replay. */
export async function enqueueRetry(args: {
  agentId: string;
  ownerId: string;
  chatId?: string;
  chatType?: string;
  failedArgv: string[];
  pendingScopes: string[];
}): Promise<string> {
  const id = randomUUID();
  await workerDb.insert(agentSchema.agentRetryQueue).values({
    id,
    ownerId: args.ownerId,
    agentId: args.agentId,
    chatId: args.chatId ?? null,
    chatType: args.chatType ?? null,
    failedArgv: args.failedArgv,
    pendingScopes: args.pendingScopes,
    status: 'pending'
  });
  log.info(
    `enqueued retry ${id} for agent ${args.agentId} (scopes: ${args.pendingScopes.join(',')})`
  );
  return id;
}

/** Atomically claim the oldest pending retry for an agent (mark running). */
export async function claimPendingRetry(agentId: string): Promise<RetryRow | null> {
  const claimed = await workerDb
    .update(agentSchema.agentRetryQueue)
    .set({ status: 'running' })
    .where(
      and(
        eq(agentSchema.agentRetryQueue.agentId, agentId),
        eq(agentSchema.agentRetryQueue.status, 'pending')
      )
    )
    .returning();
  // Oldest pending (createdAt asc). For multi-row contention a single UPDATE
  // ... RETURNING could claim several; keep only the first to replay one at a time.
  const row = (claimed as RetryRow[]).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )[0];
  if (!row) return null;
  if ((claimed as RetryRow[]).length > 1) {
    // re-mark the extras back to pending
    for (const r of (claimed as RetryRow[]).slice(1)) {
      await workerDb
        .update(agentSchema.agentRetryQueue)
        .set({ status: 'pending' })
        .where(eq(agentSchema.agentRetryQueue.id, r.id));
    }
  }
  return row;
}

/** Mark a retry row done or failed. */
export async function markRetry(id: string, status: 'done' | 'failed'): Promise<void> {
  await workerDb
    .update(agentSchema.agentRetryQueue)
    .set({ status })
    .where(eq(agentSchema.agentRetryQueue.id, id));
}
