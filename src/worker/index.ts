// ============================================================
// Worker Entry Point
// ------------------------------------------------------------
// 1. Boots the AgentManager → starts all active agents as
//    individual Feishu Channel connections
// 2. Boots the Scheduler → registers cron-based active triggers
// 3. Boots the AuthManager → polls for OAuth device flow tasks
// 4. Runs until SIGTERM / SIGINT → graceful shutdown
//
// Usage: pnpm worker
//        node --require tsx src/worker/index.ts
// ============================================================

import { AgentManager } from './agent-manager';
import { Scheduler } from './trigger/scheduler';
import { AuthManager } from './core/auth-manager';
import { enqueueRetry } from './core/retry-queue';
import { replayPending } from './core/auth-replay';
import { createLogger } from './core/logger';
import { runMigrations } from '../lib/migrate';

const log = createLogger('worker');

async function main() {
  log.info('Arion Worker starting...');

  // Apply pending DB migrations before booting anything. Fails fast on error —
  // a worker running against an out-of-date schema is worse than no worker.
  try {
    await runMigrations();
  } catch (err: any) {
    log.error(`database migration failed: ${err?.message ?? err}`);
    process.exit(1);
  }

  const agentMgr = new AgentManager();
  const scheduler = new Scheduler();
  const authMgr = new AuthManager();

  // Wire the reactive incremental-auth loop BEFORE starting anything, so the
  // first-created runtimes already carry authHooks:
  //  1. agent runtimes + scheduler get onMissingUserScope → enqueue a replay
  //     row + start a device flow for the missing scope (lark-cli accumulates
  //     scopes, so the old token keeps working while the new one is pending).
  //  2. authMgr.onAuthorized → replayPending claims the row and re-runs the
  //     failed call as a proactive turn ("scope granted, continue"), then
  //     marks it done/failed.
  const authHooks = {
    onMissingUserScope: async (
      agentId: string,
      ownerId: string,
      scopes: string[],
      chatId: string | undefined,
      failedArgv: string[]
    ): Promise<{ verificationUrl: string } | null> => {
      // Enqueue BEFORE starting the flow so the retry row exists by the time
      // onAuthorized fires.
      await enqueueRetry({
        agentId,
        ownerId,
        chatId,
        chatType: 'p2p',
        failedArgv,
        pendingScopes: scopes
      });
      return authMgr.startIncrementalAuth(agentId, scopes);
    }
  };
  agentMgr.setAuthHooks(authHooks);
  scheduler.setAuthHooks(authHooks);
  authMgr.onAuthorized = async (agentId: string) => {
    await replayPending(agentId, agentMgr.sendForAgent.bind(agentMgr));
  };

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info(`received ${signal}, shutting down...`);
    await scheduler.stop();
    await authMgr.stop();
    await agentMgr.stopAll();
    log.info('worker stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    // 1. Start all agents (Channel SDK connections)
    await agentMgr.startAll();

    // 2. Wire scheduler's sender through the agent manager
    scheduler.setSender(agentMgr.sendForAgent.bind(agentMgr));

    // 3. Start scheduler (cron-based proactive triggers)
    await scheduler.start();

    // 4. Start auth manager (OAuth device flow poller)
    await authMgr.start();

    log.info('Worker started. All agents are running.');
  } catch (err: any) {
    log.error(`startup error: ${err?.message ?? err}`);
    await agentMgr.stopAll();
    await scheduler.stop();
    await authMgr.stop();
    process.exit(1);
  }
}

main();
