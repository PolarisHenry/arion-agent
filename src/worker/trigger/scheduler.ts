// ============================================================
// Scheduler — cron-based proactive triggers for agents
// ============================================================

import cron, { type ScheduledTask } from 'node-cron';
import { eq } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { createLogger } from '../core/logger';
import { writeLog } from '../core/log-writer';
import { refreshHolidays, isChineseWorkday } from '../core/holidays';
import { config } from '../config';
import { runProactiveTurn } from '../core/proactive-runner';
import type { AuthHooks } from '../core/tools';

const log = createLogger('scheduler');

type ActiveTrigger = {
  row: typeof agentSchema.agentTrigger.$inferSelect;
  job: ScheduledTask;
};

/** For workdaysOnly triggers: keep the cron's minute + hour but drop the
 *  day/month/weekday fields so the job fires daily, then isChineseWorkday()
 *  decides whether to actually run. Needed because 调休 make-up days land on
 *  weekends that a `* * 1-5` expression would never fire on. */
function toDailyCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  return `${parts[0] ?? '0'} ${parts[1] ?? '*'} * * *`;
}

export class Scheduler {
  private triggers: Map<string, ActiveTrigger> = new Map();
  // Polls agent_trigger every 10s so create / update / delete / enable-disable
  // take effect without restarting the worker.
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  // Daily refresh of the CN holiday schedule (statutory holidays + 调休).
  private holidayTimer: ReturnType<typeof setInterval> | null = null;
  // Serializes syncFromDb: the 10s interval could otherwise fire a second
  // pass while the first is still awaiting the DB query, racing on the Map
  // and potentially double-registering a job. Same pattern as AuthManager.
  private syncing = false;
  // Channel instance for sending proactive messages — set by start()
  private sendFn: ((agentId: string, chatId: string, content: string) => Promise<void>) | null =
    null;
  // Reactive incremental-auth hook — set by index.ts, merged into each
  // proactive turn's toolCtx so trigger-path --as user missing_scope also
  // kicks off the reactive device flow + replay.
  private authHooks?: AuthHooks;

  /** Set the function used to send proactive messages. */
  setSender(sendFn: (agentId: string, chatId: string, content: string) => Promise<void>): void {
    this.sendFn = sendFn;
  }

  /** Inject the reactive incremental-auth hook (called by index.ts). */
  setAuthHooks(hooks: AuthHooks): void {
    this.authHooks = hooks;
  }

  /** Load all enabled triggers, register cron jobs, and start polling. */
  async start(): Promise<void> {
    await refreshHolidays();
    await this.syncFromDb();
    this.pollTimer = setInterval(() => this.syncFromDb(), 10_000);
    // Daily refresh keeps the holiday schedule current (new-year notices land
    // in Nov; a daily nudge also picks up late 调休 adjustments) — no restart.
    this.holidayTimer = setInterval(() => refreshHolidays(), 24 * 60 * 60 * 1000);
    log.info('trigger poller started (interval: 10000ms)');
  }

  /**
   * Reconcile in-memory cron jobs with the DB: register new triggers, reload
   * changed ones (by content hash), and stop/remove deleted or disabled ones.
   * Uses a content hash rather than updatedAt so the post-execution lastRunAt
   * write (which bumps updatedAt via $onUpdate) does not cause a spurious
   * reload on every fire.
   */
  private async syncFromDb(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const rows = await workerDb.select().from(agentSchema.agentTrigger);
      const dbMap = new Map(rows.map((r) => [r.id, r]));

      // Removed / disabled: in memory but absent or disabled in DB
      for (const [id, active] of this.triggers) {
        const row = dbMap.get(id);
        if (!row || !row.enabled) {
          active.job.stop();
          this.triggers.delete(id);
          log.info(`trigger removed: "${active.row.name}"`);
        }
      }

      // Added / changed: enabled in DB
      for (const row of rows) {
        if (!row.enabled) continue;
        const existing = this.triggers.get(row.id);
        if (!existing) {
          this.register(row);
          continue;
        }
        if (this.triggerHash(existing.row) !== this.triggerHash(row)) {
          existing.job.stop();
          this.register(row);
          log.info(`trigger reloaded: "${row.name}" (${row.cron})`);
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  /** Content fingerprint of a trigger's scheduling-relevant fields. */
  private triggerHash(r: typeof agentSchema.agentTrigger.$inferSelect): string {
    return [
      r.name,
      r.cron,
      r.prompt,
      r.targetChatId ?? '',
      String(r.enabled),
      String(r.workdaysOnly)
    ].join('|');
  }

  /** Register a single trigger as a cron job. */
  private register(row: typeof agentSchema.agentTrigger.$inferSelect): void {
    // workdaysOnly: fire daily (keep minute+hour), let isChineseWorkday() vet
    // each fire — 调休 make-up weekends run, statutory holidays skip.
    const effectiveCron = row.workdaysOnly ? toDailyCron(row.cron) : row.cron;
    if (!cron.validate(effectiveCron)) {
      log.warn(`invalid cron expression for trigger "${row.name}": ${row.cron}`);
      return;
    }

    // Evaluate the cron in the agent's timezone. Trigger expressions are
    // produced by the LLM, which is told config.agentTimezone as "now"
    // (buildCurrentTimeContext) — so "15 7 * * *" means 07:15 in that tz, not
    // 07:15 in the container's UTC. Without this a 7:15 reminder fires at
    // 15:15 local (8h off for Asia/Shanghai) and the user sees it "never fire".
    const job = cron.schedule(
      effectiveCron,
      async () => {
        await this.execute(row);
      },
      { timezone: config.agentTimezone }
    );

    this.triggers.set(row.id, { row, job });
    log.info(
      `trigger registered: "${row.name}" (${effectiveCron}${row.workdaysOnly ? ' · workdays-only' : ''})`
    );
  }

  /** Execute a trigger — delegate the proactive turn to runProactiveTurn
   *  (shared with the auth-replay resume path), keep the workdays-only guard,
   *  the lastRunAt update, and the error writeLog here in the scheduler. */
  private async execute(triggerRow: typeof agentSchema.agentTrigger.$inferSelect): Promise<void> {
    const startTime = Date.now();
    log.info(`trigger fired: "${triggerRow.name}"`);

    // workdaysOnly: a daily cron wakes us up, but we only actually run on a
    // Chinese workday — skips statutory holidays; 调休 make-up weekends pass.
    if (triggerRow.workdaysOnly && !isChineseWorkday(new Date(), config.agentTimezone)) {
      log.info(`trigger "${triggerRow.name}" skipped — not a CN workday today`);
      return;
    }

    try {
      await runProactiveTurn({
        agentId: triggerRow.agentId,
        ownerId: triggerRow.ownerId,
        // Pass undefined (NOT 'trigger') so the sentinel can't leak into
        // toolCtx.chatId — manage_schedule would otherwise persist a bogus
        // target_chat_id='trigger'. The 'trigger' fallback is log-row-only.
        chatId: triggerRow.targetChatId ?? undefined,
        chatType: 'trigger',
        userMessage: triggerRow.prompt,
        sendFn: this.sendFn ?? undefined,
        toolCtxExtras: { authHooks: this.authHooks },
        triggeredRun: { targetChatId: triggerRow.targetChatId }
      });
      await workerDb
        .update(agentSchema.agentTrigger)
        .set({ lastRunAt: new Date() })
        .where(eq(agentSchema.agentTrigger.id, triggerRow.id));
    } catch (err: any) {
      log.error(`trigger "${triggerRow.name}" error: ${err?.message ?? err}`);
      await writeLog({
        agentId: triggerRow.agentId,
        ownerId: triggerRow.ownerId,
        chatId: triggerRow.targetChatId ?? 'trigger',
        type: 'trigger',
        messageContent: triggerRow.prompt,
        status: 'error',
        error: err?.message ?? String(err),
        durationMs: Date.now() - startTime
      });
    }
  }

  /** Stop polling and all cron jobs. */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.holidayTimer) {
      clearInterval(this.holidayTimer);
      this.holidayTimer = null;
    }
    for (const [, { job, row }] of this.triggers) {
      job.stop();
      log.info(`trigger stopped: "${row.name}"`);
    }
    this.triggers.clear();
  }
}
