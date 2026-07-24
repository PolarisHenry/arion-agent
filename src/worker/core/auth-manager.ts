// ============================================================
// AuthManager — polls agent_user_auth for device flow tasks
// ------------------------------------------------------------
// Runs in the worker process. Watches the agent_user_auth table
// for rows with status=pending_start / awaiting_user / completing
// / revoking, then executes lark-cli auth login commands to drive
// the OAuth device flow. awaiting_user rows are auto-polled with
// --device-code in the background so the flow completes the moment
// the user authorizes (no manual "I have authorized" step needed).
// Tokens are stored in lark-cli config files (volume-mounted),
// NOT in the DB — this manager only updates status/metadata.
// ============================================================

import { eq, sql } from 'drizzle-orm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { workerDb, agentSchema } from '../worker-db';
import { config } from '../config';
import { createLogger } from './logger';

const log = createLogger('auth-manager');
const execFileAsync = promisify(execFile);

type AuthRow = typeof agentSchema.agentUserAuth.$inferSelect;

export class AuthManager {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  // agentIds with an in-flight `--device-code` auto-poll, so we never spawn a
  // second concurrent poll for the same agent (processPending runs every 2s).
  private inflightPolls = new Set<string>();
  // Serializes processPending: now that exec calls are async, the 2s interval
  // could otherwise fire a second pass while the first is still awaiting.
  private processing = false;

  /** Called whenever a device flow completes (full or incremental) — the
   *  worker wires this to proactive-runner to replay any pending retry. */
  onAuthorized: ((agentId: string) => Promise<void>) | null = null;

  async start(): Promise<void> {
    log.info('starting auth poller...');
    await this.processPending();
    this.pollTimer = setInterval(() => this.processPending(), 2000);
    log.info('auth poller started (interval: 2000ms)');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    log.info('auth poller stopped');
  }

  private async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const rows = await workerDb
        .select()
        .from(agentSchema.agentUserAuth)
        .where(
          sql`${agentSchema.agentUserAuth.status} IN ('pending_start', 'awaiting_user', 'completing', 'revoking', 'incremental_awaiting')`
        );

      for (const row of rows) {
        try {
          if (row.status === 'pending_start') {
            await this.runStart(row);
          } else if (row.status === 'awaiting_user') {
            // Auto-poll the device code in the background (non-blocking) so the
            // flow completes the moment the user authorizes — no manual button,
            // no device code expiring while the user is slow to click.
            this.startDevicePoll(row);
          } else if (row.status === 'incremental_awaiting') {
            // Incremental flow reuses the same auto-poll — lark-cli accumulates
            // the new scope onto the existing token and flips back to authorized.
            this.startDevicePoll(row);
          } else if (row.status === 'completing') {
            await this.runComplete(row);
          } else if (row.status === 'revoking') {
            await this.runRevoke(row);
          }
        } catch (err: any) {
          log.error(`auth flow error for agent ${row.agentId}: ${err?.message ?? err}`);
        }
      }
    } catch (err: any) {
      // DB might not be ready yet — don't crash the poller
      log.warn(`poll error: ${err?.message ?? err}`);
    } finally {
      this.processing = false;
    }
  }

  // ----------------------------------------------------------
  // Incremental scope authorization: kick off a SECOND device flow
  // to add scopes to an already-valid token (lark-cli accumulates
  // scopes across logins). The old token keeps working for the
  // scopes it already had, so the agent stays "authorized" the
  // whole time — the row goes incremental_awaiting → authorized.
  // ----------------------------------------------------------
  async startIncrementalAuth(
    agentId: string,
    scopes: string[]
  ): Promise<{ verificationUrl: string } | null> {
    if (scopes.length === 0) return null;

    // Reuse an in-flight incremental flow if one is still valid (not expired).
    // Repeated missing_scope triggers (user retries, replay) must NOT clobber a
    // device code the user may still be completing in their browser — each new
    // `auth login --scope ... --no-wait` spawns a fresh device flow that
    // invalidates the prior deviceCode, so the user would click a stale link,
    // hit "授权请求已过期", and the flow would flip to error.
    const [existing] = await workerDb
      .select()
      .from(agentSchema.agentUserAuth)
      .where(eq(agentSchema.agentUserAuth.agentId, agentId))
      .limit(1);
    const stillValid =
      existing?.status === 'incremental_awaiting' &&
      existing.verificationUrl &&
      existing.tokenExpiresAt &&
      existing.tokenExpiresAt > new Date();
    if (stillValid) {
      log.info(`reusing in-flight incremental auth for agent ${agentId} (not starting a new flow)`);
      return { verificationUrl: existing.verificationUrl! };
    }

    const [agentRow] = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.id, agentId))
      .limit(1);
    if (!agentRow) {
      log.warn(`startIncrementalAuth: agent ${agentId} not found`);
      return null;
    }
    const profile = agentRow.larkCliProfile;
    const scopeArgs = scopes.flatMap((s) => ['--scope', s]);
    try {
      const { stdout: out } = await execFileAsync(
        config.larkCliPath,
        ['--profile', profile, 'auth', 'login', ...scopeArgs, '--no-wait', '--json'],
        { encoding: 'utf8', timeout: 15_000 }
      );
      const parsed = JSON.parse(out);
      const deviceCode: string = parsed.device_code;
      const verificationUrl: string = parsed.verification_url;
      const expiresIn: number = parsed.expires_in ?? 600;
      if (!deviceCode || !verificationUrl) {
        log.error(`startIncrementalAuth: missing device_code/url in ${out}`);
        return null;
      }
      await workerDb
        .update(agentSchema.agentUserAuth)
        .set({
          status: 'incremental_awaiting',
          deviceCode,
          verificationUrl,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          errorMsg: null
        })
        .where(eq(agentSchema.agentUserAuth.agentId, agentId));
      log.info(`incremental auth started for agent ${agentId} (scopes: ${scopes.join(',')})`);
      return { verificationUrl };
    } catch (err: any) {
      log.error(`startIncrementalAuth failed: ${err?.message ?? err}`);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Device flow start: lark-cli auth login --no-wait --json
  // ----------------------------------------------------------
  private async runStart(row: AuthRow): Promise<void> {
    log.info(`starting device flow for agent ${row.agentId}`);

    // Look up the agent to get its lark-cli profile name
    const [agentRow] = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.id, row.agentId))
      .limit(1);

    if (!agentRow) {
      await this.markError(row, 'Agent not found in DB');
      return;
    }

    const profile = agentRow.larkCliProfile;
    log.info(`requesting minimal (recommended) user auth for agent ${row.agentId}`);

    try {
      const { stdout: out } = await execFileAsync(
        config.larkCliPath,
        ['--profile', profile, 'auth', 'login', '--recommend', '--no-wait', '--json'],
        { encoding: 'utf8', timeout: 15_000 }
      );

      const parsed = JSON.parse(out);
      const deviceCode: string = parsed.device_code;
      const verificationUrl: string = parsed.verification_url;
      const expiresIn: number = parsed.expires_in ?? 600;

      if (!deviceCode || !verificationUrl) {
        await this.markError(row, `Missing device_code or verification_url in response: ${out}`);
        return;
      }

      await workerDb
        .update(agentSchema.agentUserAuth)
        .set({
          status: 'awaiting_user',
          deviceCode,
          verificationUrl,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          errorMsg: null
        })
        .where(eq(agentSchema.agentUserAuth.id, row.id));

      log.info(`device flow awaiting user: ${verificationUrl}`);
    } catch (err: any) {
      await this.markError(row, `auth login --no-wait failed: ${err?.message ?? err}`);
    }
  }

  // ----------------------------------------------------------
  // Auto-poll: while awaiting_user, poll --device-code in the
  // background until the user authorizes or the code expires.
  // Non-blocking (async execFile) — does NOT stall agent messages.
  // ----------------------------------------------------------
  private startDevicePoll(row: AuthRow): void {
    if (!row.deviceCode) return;
    if (this.inflightPolls.has(row.agentId)) return;
    this.inflightPolls.add(row.agentId);
    log.info(`auto-polling device code for agent ${row.agentId}`);
    this.pollDeviceCode(row)
      .catch((err: any) =>
        log.error(`unexpected device poll error for agent ${row.agentId}: ${err?.message ?? err}`)
      )
      .finally(() => this.inflightPolls.delete(row.agentId));
  }

  private async pollDeviceCode(row: AuthRow): Promise<void> {
    const [agentRow] = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.id, row.agentId))
      .limit(1);

    if (!agentRow) {
      await this.markError(row, 'Agent not found in DB');
      return;
    }

    const profile = agentRow.larkCliProfile;

    try {
      // --device-code polls internally until the user authorizes or the code
      // expires. We cap each call so a single poll can't run forever; on timeout
      // we simply retry next cycle (the device code stays valid until used).
      const { stdout } = await execFileAsync(
        config.larkCliPath,
        ['--profile', profile, 'auth', 'login', '--device-code', row.deviceCode!],
        { encoding: 'utf8', timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }
      );

      let userOpenId: string | null = null;
      let userName: string | null = null;
      let grantedScopes: string[] = [];
      let tokenExpiresAt: Date | null = null;

      try {
        const parsed = JSON.parse(stdout);
        userOpenId =
          parsed.user_open_id ?? parsed.open_id ?? parsed.identity?.user?.open_id ?? null;
        userName = parsed.user_name ?? parsed.name ?? parsed.identity?.user?.name ?? null;
        grantedScopes = parsed.scopes ?? parsed.granted_scopes ?? [];
        if (parsed.expires_at) {
          tokenExpiresAt = new Date(parsed.expires_at);
        } else if (parsed.expires_in) {
          tokenExpiresAt = new Date(Date.now() + parsed.expires_in * 1000);
        }
      } catch {
        log.warn(
          `auth login --device-code output not JSON, treating as success: ${stdout.slice(0, 200)}`
        );
      }

      // Guard: the row may have been revoked/reset while we were polling.
      if (!(await this.stillAwaiting(row.id))) {
        log.info(`device poll finished but row ${row.id} left awaiting_user — ignoring`);
        return;
      }

      await workerDb
        .update(agentSchema.agentUserAuth)
        .set({
          status: 'authorized',
          userOpenId,
          userName,
          grantedScopes,
          tokenExpiresAt,
          deviceCode: null,
          verificationUrl: null,
          errorMsg: null
        })
        .where(eq(agentSchema.agentUserAuth.id, row.id));

      log.info(
        `device flow auto-completed for agent ${row.agentId} (user: ${userName ?? 'unknown'})`
      );

      if (this.onAuthorized) {
        try {
          await this.onAuthorized(row.agentId);
        } catch (e: any) {
          log.warn(`onAuthorized failed: ${e?.message ?? e}`);
        }
      }
    } catch (err: any) {
      const stderr = err?.stderr ?? '';
      const msg = `${stderr} ${err?.message ?? String(err)}`;

      // Killed by our timeout, or lark-cli reports the user hasn't authorized
      // yet → keep awaiting_user and retry on the next poll cycle.
      const pending =
        err?.signal === 'SIGTERM' || /authorization_pending|\bpending\b|slow_down/i.test(msg);
      if (pending) {
        log.debug(`device poll still pending for agent ${row.agentId}, will retry`);
        return;
      }

      // Row changed state while polling — don't clobber it.
      if (!(await this.stillAwaiting(row.id))) return;

      // Incremental auth failure MUST NOT destroy the base authorization:
      // the user's existing token (from the initial recommended-scope flow) is
      // still perfectly valid — only the new scope addition failed (e.g. device
      // code expired before the user clicked the link). Rolling back to
      // 'authorized' keeps --as user calls working while the user re-triggers
      // the incremental flow on the next missing_scope. Without this, a stale
      // incremental link flips the entire auth row to 'error', which
      // refreshUserAuthStatus() reads as hasUserAuth=false, and executeTool's
      // guard blocks ALL --as user calls — the "授权错误" death loop.
      const wasIncremental = row.status === 'incremental_awaiting';
      const expired = /expired|expired_token|device_code/i.test(msg);
      const denied = /access_denied|denied/i.test(msg);
      const errMsg = expired
        ? '增量授权请求已过期（基础授权仍有效），下次使用缺失权限时自动重试。'
        : denied
          ? '增量授权被拒绝（基础授权仍有效）。'
          : `增量授权失败: ${msg}`;
      if (wasIncremental) {
        log.warn(
          `incremental auth failed for agent ${row.agentId}, rolling back to authorized: ${errMsg}`
        );
        await workerDb
          .update(agentSchema.agentUserAuth)
          .set({
            status: 'authorized',
            deviceCode: null,
            verificationUrl: null,
            errorMsg: errMsg
          })
          .where(eq(agentSchema.agentUserAuth.id, row.id));
      } else {
        await this.markError(row, errMsg);
      }
    }
  }

  private async stillAwaiting(rowId: string): Promise<boolean> {
    const [current] = await workerDb
      .select({ status: agentSchema.agentUserAuth.status })
      .from(agentSchema.agentUserAuth)
      .where(eq(agentSchema.agentUserAuth.id, rowId))
      .limit(1);
    // Both "still polling" states are valid — awaiting_user for the full flow,
    // incremental_awaiting for the add-scope flow. Anything else (revoked,
    // reset, error) means we should NOT clobber the row.
    return current?.status === 'awaiting_user' || current?.status === 'incremental_awaiting';
  }

  // ----------------------------------------------------------
  // Device flow complete: lark-cli auth login --device-code
  // ----------------------------------------------------------
  private async runComplete(row: AuthRow): Promise<void> {
    log.info(`completing device flow for agent ${row.agentId}`);

    if (!row.deviceCode) {
      await this.markError(row, 'No device_code — cannot complete');
      return;
    }

    const [agentRow] = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.id, row.agentId))
      .limit(1);

    if (!agentRow) {
      await this.markError(row, 'Agent not found in DB');
      return;
    }

    const profile = agentRow.larkCliProfile;

    try {
      const { stdout: out } = await execFileAsync(
        config.larkCliPath,
        ['--profile', profile, 'auth', 'login', '--device-code', row.deviceCode],
        { encoding: 'utf8', timeout: 30_000 }
      );

      // Parse the success response. lark-cli outputs a JSON object with
      // identity info on success.
      let userOpenId: string | null = null;
      let userName: string | null = null;
      let grantedScopes: string[] = [];
      let tokenExpiresAt: Date | null = null;

      try {
        const parsed = JSON.parse(out);
        // lark-cli's auth login output varies; try common fields
        userOpenId =
          parsed.user_open_id ?? parsed.open_id ?? parsed.identity?.user?.open_id ?? null;
        userName = parsed.user_name ?? parsed.name ?? parsed.identity?.user?.name ?? null;
        grantedScopes = parsed.scopes ?? parsed.granted_scopes ?? [];

        if (parsed.expires_at) {
          tokenExpiresAt = new Date(parsed.expires_at);
        } else if (parsed.expires_in) {
          tokenExpiresAt = new Date(Date.now() + parsed.expires_in * 1000);
        }
      } catch {
        // If output isn't JSON, treat as success but without parsed fields
        log.warn(`auth login output is not JSON, treating as success: ${out.slice(0, 200)}`);
      }

      await workerDb
        .update(agentSchema.agentUserAuth)
        .set({
          status: 'authorized',
          userOpenId,
          userName,
          grantedScopes,
          tokenExpiresAt,
          deviceCode: null,
          verificationUrl: null,
          errorMsg: null
        })
        .where(eq(agentSchema.agentUserAuth.id, row.id));

      log.info(`device flow completed for agent ${row.agentId} (user: ${userName ?? 'unknown'})`);

      if (this.onAuthorized) {
        try {
          await this.onAuthorized(row.agentId);
        } catch (e: any) {
          log.warn(`onAuthorized failed: ${e?.message ?? e}`);
        }
      }
    } catch (err: any) {
      // lark-cli's error envelope is JSON in err.stderr; err.message is just
      // "Command failed: ...". Parse stderr for the real reason.
      const stderr = err?.stderr ?? '';
      let detail = err?.message ?? String(err);
      try {
        const start = stderr.indexOf('{');
        if (start !== -1) {
          const env = JSON.parse(stderr.slice(start));
          detail = env?.error?.message ?? env?.error?.hint ?? detail;
        }
      } catch {
        // stderr not JSON — fall back to err.message
      }
      const expired = /expired|device_code|expired_token/i.test(`${stderr} ${detail}`);
      await this.markError(
        row,
        expired
          ? 'Device code expired (>10 min). Please restart the authorization.'
          : `auth login --device-code failed: ${detail}`
      );
    }
  }

  // ----------------------------------------------------------
  // Revoke: lark-cli auth logout
  // ----------------------------------------------------------
  private async runRevoke(row: AuthRow): Promise<void> {
    log.info(`revoking user auth for agent ${row.agentId}`);

    const [agentRow] = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.id, row.agentId))
      .limit(1);

    if (!agentRow) {
      await this.markError(row, 'Agent not found in DB');
      return;
    }

    const profile = agentRow.larkCliProfile;

    try {
      await execFileAsync(config.larkCliPath, ['--profile', profile, 'auth', 'logout'], {
        encoding: 'utf8',
        timeout: 15_000
      });
      log.info(`user auth revoked for agent ${row.agentId}`);
    } catch (err: any) {
      // logout might fail if not logged in — that's fine
      log.warn(`auth logout warning: ${err?.message ?? err}`);
    }

    await workerDb
      .update(agentSchema.agentUserAuth)
      .set({
        status: 'revoked',
        userOpenId: null,
        userName: null,
        grantedScopes: null,
        tokenExpiresAt: null,
        deviceCode: null,
        verificationUrl: null,
        errorMsg: null
      })
      .where(eq(agentSchema.agentUserAuth.id, row.id));
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private async markError(row: AuthRow, msg: string): Promise<void> {
    log.error(`auth error for agent ${row.agentId}: ${msg}`);
    await workerDb
      .update(agentSchema.agentUserAuth)
      .set({ status: 'error', errorMsg: msg })
      .where(eq(agentSchema.agentUserAuth.id, row.id));
  }
}
