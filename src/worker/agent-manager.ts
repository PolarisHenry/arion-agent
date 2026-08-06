// ============================================================
// Agent Manager — starts/stops all active agents, hot-reload
// ============================================================

import { eq, and } from 'drizzle-orm';
import { workerDb, agentSchema } from './worker-db';
import { config } from './config';
import { createLogger } from './core/logger';
import { AgentRuntime } from './core/agent-runtime';
import type { AuthHooks } from './core/tools';

const log = createLogger('agent-mgr');

/** Merge `needsReauth` into a wechat agent's platformConfig jsonb. */
async function setWechatNeedsReauth(agentId: string, value: boolean): Promise<void> {
  const [row] = await workerDb
    .select()
    .from(agentSchema.agent)
    .where(eq(agentSchema.agent.id, agentId))
    .limit(1);
  if (!row) return;
  const cur = (row.platformConfig as Record<string, unknown> | null) ?? {};
  await workerDb
    .update(agentSchema.agent)
    .set({ platformConfig: { ...cur, needsReauth: value } })
    .where(eq(agentSchema.agent.id, agentId));
}

export class AgentManager {
  private runtimes: Map<string, AgentRuntime> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Reactive incremental-auth hook — propagated to every runtime so its
   *  toolCtx carries authHooks for lark-executor's missing_scope handling. */
  private authHooks?: AuthHooks;

  /** Inject the reactive auth hook and propagate to all running runtimes.
   *  Safe to call before or after startAll — startAgent also applies it to
   *  runtimes created later via hot-reload. */
  setAuthHooks(hooks: AuthHooks): void {
    this.authHooks = hooks;
    for (const rt of this.runtimes.values()) rt.setAuthHooks(hooks);
  }

  /** Load all active agents from DB and start their Channel connections. */
  async startAll(): Promise<void> {
    // Get all active agent rows
    const agentRows = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.status, 'active'));

    log.info(`found ${agentRows.length} active agent(s)`);

    for (const row of agentRows) {
      await this.startAgent(row);
    }

    // Start config poller for hot-reload
    this.pollTimer = setInterval(() => this.pollConfigChanges(), config.pollIntervalMs);
    log.info(`config poller started (interval: ${config.pollIntervalMs}ms)`);
  }

  /** Start a single agent by its DB row. */
  async startAgent(row: typeof agentSchema.agent.$inferSelect): Promise<void> {
    const log2 = createLogger(`agent-mgr:${row.name}`);

    // Load the bound LLM model
    const [llmRow] = await workerDb
      .select()
      .from(agentSchema.llmModel)
      .where(
        and(eq(agentSchema.llmModel.id, row.llmModelId), eq(agentSchema.llmModel.isActive, true))
      )
      .limit(1);

    if (!llmRow) {
      log2.warn(`bound LLM model ${row.llmModelId} not found or inactive — skipping`);
      return;
    }

    try {
      const runtime = new AgentRuntime(row, llmRow);
      if (this.authHooks) runtime.setAuthHooks(this.authHooks);

      // WeChat guard: an unprovisioned agent (no stored SDK credentials) must
      // not reach connect() — bot.login() would block on a QR nobody scans.
      if (!(await runtime.isProvisioned())) {
        log2.warn(`not provisioned (no wechat credentials) — marking needsReauth, skipping`);
        await setWechatNeedsReauth(row.id, true);
        return;
      }
      // Provisioned wechat agent: clear any stale needsReauth left by a -14.
      if ((row.platform ?? 'lark') === 'wechat') {
        await setWechatNeedsReauth(row.id, false);
      }

      await runtime.start();
      this.runtimes.set(row.id, runtime);
      log2.info('started');
    } catch (err: any) {
      log2.error(`failed to start: ${err?.message ?? err}`);
    }
  }

  /** Stop a single agent. */
  async stopAgent(agentId: string): Promise<void> {
    const runtime = this.runtimes.get(agentId);
    if (!runtime) return;
    try {
      await runtime.stop();
      this.runtimes.delete(agentId);
      log.info(`stopped: ${runtime.name}`);
    } catch (err: any) {
      log.error(`stop error for ${agentId}: ${err?.message ?? err}`);
    }
  }

  /** Stop all agents and the config poller. */
  async stopAll(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    const ids = Array.from(this.runtimes.keys());
    await Promise.all(ids.map((id) => this.stopAgent(id)));
    log.info('all agents stopped');
  }

  /**
   * Send a message to a chat on behalf of an agent.
   * Used by the Scheduler to deliver proactive trigger results.
   */
  async sendForAgent(agentId: string, chatId: string, content: string): Promise<void> {
    const runtime = this.runtimes.get(agentId);
    if (!runtime) {
      log.warn(`sendForAgent: agent ${agentId} not running`);
      return;
    }
    await runtime.sendToChat(chatId, content);
  }

  /** Hot-reload: check DB for new/updated/deleted agents. */
  private async pollConfigChanges(): Promise<void> {
    try {
      // Reload existing agents that changed
      for (const [id, runtime] of this.runtimes) {
        await runtime.reloadFromDb();
      }

      // Drop running wechat agents whose session expired (-14 → needsReauth)
      // so a fresh dashboard scan can restart them via the new-agent path.
      for (const [id, runtime] of this.runtimes) {
        if (runtime.isWechatNeedsReauth()) {
          log.info(`agent ${runtime.name} needs reauth — dropping from runtime pool`);
          this.runtimes.delete(id);
        }
      }

      // Check for new active agents
      const activeRows = await workerDb
        .select()
        .from(agentSchema.agent)
        .where(eq(agentSchema.agent.status, 'active'));

      for (const row of activeRows) {
        if (!this.runtimes.has(row.id)) {
          log.info(`new active agent detected: ${row.name}`);
          await this.startAgent(row);
        }
      }

      // Stop agents that became inactive or were deleted
      const activeIds = new Set(activeRows.map((r) => r.id));
      for (const [id, runtime] of this.runtimes) {
        if (!activeIds.has(id)) {
          log.info(`agent ${runtime.name} is no longer active — stopping`);
          await this.stopAgent(id);
        }
      }
    } catch (err: any) {
      log.warn(`config poll error: ${err?.message ?? err}`);
    }
  }
}
