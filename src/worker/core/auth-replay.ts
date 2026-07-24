// ============================================================
// Auth replay — after incremental auth completes, re-run the
// failed user-identity call that triggered it.
// ------------------------------------------------------------
// AuthManager.onAuthorized → replayPending(agentId, sendFn):
// claim the oldest pending retry row, inject a "scope granted,
// continue" synthetic user turn into a fresh proactive run (the
// LLM sees its prior failed tool calls in the session history and
// retries the original command now that the new scope is live),
// then mark the retry done/failed.
// ============================================================

import { claimPendingRetry, markRetry } from './retry-queue';
import { runProactiveTurn, type ProactiveSender } from './proactive-runner';
import { createLogger } from './logger';

const log = createLogger('auth-replay');

/** After incremental auth completes, replay the failed user-identity call:
 *  claim the pending retry, inject a "scope granted, continue" user message
 *  (the LLM sees prior failed tool calls in session history and retries),
 *  then mark the retry done/failed. Returns silently if no retry is pending.
 *  Never throws — own errors mark the row failed so the auth poller's
 *  onAuthorized callback stays alive. */
export async function replayPending(agentId: string, sendFn: ProactiveSender): Promise<void> {
  const row = await claimPendingRetry(agentId);
  if (!row) return;
  log.info(`replaying retry ${row.id} for agent ${agentId}`);
  const argv = (row.failedArgv as string[] | null) ?? [];
  const scopes = (row.pendingScopes as string[] | null) ?? [];
  const userMessage =
    `用户已授权缺失的权限 (${scopes.join(', ')})。请继续完成刚才未能执行的操作` +
    (argv.length ? `(原命令: ${argv.join(' ')})` : '') +
    '。';
  try {
    await runProactiveTurn({
      agentId,
      ownerId: row.ownerId,
      chatId: row.chatId ?? 'replay',
      chatType: row.chatType ?? 'p2p',
      userMessage,
      sendFn
    });
    await markRetry(row.id, 'done');
  } catch (err: any) {
    log.error(`replay ${row.id} failed: ${err?.message ?? err}`);
    await markRetry(row.id, 'failed');
  }
}
