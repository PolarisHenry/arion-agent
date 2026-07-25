// ============================================================
// Agent Runtime — the thinking loop for a single digital employee
// ============================================================

import { mkdirSync, rmSync } from 'node:fs';
import { execFileAsync } from './exec';
import { homedir } from 'node:os';
import { createLarkChannel, type LarkChannel, type NormalizedMessage } from '@larksuite/channel';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { eq, and, inArray } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { config } from '../config';
import { createLogger } from './logger';
import { chat, streamChat } from './llm';
import { getTools, executeTool, type AuthHooks } from './tools';
import { runAgentLoop, buildWrapUpMessages, WRAP_UP_FALLBACK } from './agent-loop';
import { resolveLoopPolicy } from './agent-policy';
import { buildSystemPrompt } from './agent-prompt';
import { loadMemoryFacts, renderMemorySection } from './agent-memory';
import { parseCommand, executeClearCommand } from './commands';
import { ChatSerializer } from './chat-serializer';
import { SessionManager } from '../session/index';
import { writeLog } from './log-writer';
import { decryptSecret } from '../../lib/crypto';

type AgentRow = typeof agentSchema.agent.$inferSelect;
type LlmModelRow = typeof agentSchema.llmModel.$inferSelect;

type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
};

// Build a "current time" context string in the configured timezone, appended to
// the system prompt so the model knows the real today/year for relative-time
// requests (e.g. "创建明天的日程" — without this, models default to their
// training cutoff year and put events in the wrong year).
// System-prompt assembly (persona + lark guide + current time + tool
// discipline, + optional triggered-run context) lives in ./agent-prompt so the
// message path and the scheduler share one source of truth.

export class AgentRuntime {
  private agentRow: AgentRow;
  private llmRow: LlmModelRow;
  private channel: LarkChannel;
  private sessionMgr: SessionManager;
  private serializer = new ChatSerializer();
  private logTag: string;

  // Refs for hot-reload
  private agentId: string;
  private currentConfigVersion: number;
  /** Whether the agent has an active user OAuth authorization. */
  private hasUserAuth: boolean = false;
  /** Reactive incremental-auth hook — set by AgentManager from index.ts.
   *  Merged into the toolCtx so lark-executor can kick off a device flow +
   *  enqueue a replay row when a user-identity call returns missing_scope. */
  private authHooks?: AuthHooks;
  /** This bot's own open_id — resolved after connect so handleMessage can skip
   *  self-sent messages without blocking cross-bot @-mentions. */
  private botOpenId: string = '';

  constructor(agentRow: AgentRow, llmRow: LlmModelRow) {
    this.agentRow = agentRow;
    this.llmRow = llmRow;
    this.agentId = agentRow.id;
    this.currentConfigVersion = agentRow.configVersion;
    this.logTag = `agent:${agentRow.name}`;
    this.sessionMgr = new SessionManager(agentRow.id, agentRow.ownerId);

    const appSecret = this.decryptAppSecret();

    this.channel = createLarkChannel({
      appId: agentRow.appId,
      appSecret,
      source: `arion-agent/${agentRow.name}`,
      loggerLevel: LoggerLevel.info
    });
  }

  get id() {
    return this.agentId;
  }
  get name() {
    return this.agentRow.name;
  }
  get ownerId() {
    return this.agentRow.ownerId;
  }

  /** Inject the reactive incremental-auth hook (called by AgentManager). */
  setAuthHooks(hooks: AuthHooks): void {
    this.authHooks = hooks;
  }

  async start(): Promise<void> {
    const log = createLogger(this.logTag);
    log.info(`starting... (model: ${this.llmRow.modelName})`);

    // Register this agent's app credentials with lark-cli before any tool can run.
    await this.ensureLarkProfile();

    // Check user OAuth status
    await this.refreshUserAuthStatus();

    this.channel.on('message', async (msg: NormalizedMessage) => {
      try {
        await this.handleMessage(msg);
      } catch (err: any) {
        log.error(`message handler error: ${err?.message ?? err}`);
        // Don't crash the channel connection
      }
    });

    this.channel.on('error', (err: any) => {
      log.error(`channel error: ${err?.message ?? err}`);
    });

    await this.channel.connect();
    // Capture this bot's own identity so handleMessage can skip self-sent
    // messages. Must happen after connect() — the bot identity isn't resolved
    // until the WebSocket handshake completes and the SDK fetches it.
    this.botOpenId = this.channel.getBotIdentity().openId;
    log.info('connected to Feishu');
  }

  async stop(): Promise<void> {
    const log = createLogger(this.logTag);
    log.info('stopping...');
    await this.channel.disconnect();
    log.info('disconnected');
  }

  private decryptAppSecret(): string {
    const log = createLogger(this.logTag);
    try {
      return decryptSecret(this.agentRow.appSecretCipher);
    } catch (err: any) {
      log.error(
        `failed to decrypt appSecret: ${err?.message ?? err}. Check SECRET_ENCRYPTION_KEY.`
      );
      // Still create the channel — it will fail at connect time with a clear
      // auth error rather than a cryptic decrypt error.
      return '';
    }
  }

  /**
   * Register this agent's app credentials with lark-cli. Without this, every tool
   * call fails with config/not_configured — the DB stores appId/appSecret but
   * nothing ever provisioned the lark-cli profile. Uses `config init --name`,
   * which is idempotent (create-or-update), so every boot re-writes the app
   * secret into the keychain — self-healing a secret lost by a prior restart.
   */
  private async ensureLarkProfile(): Promise<void> {
    const log = createLogger(this.logTag);
    const profile = this.agentRow.larkCliProfile;
    const appId = this.agentRow.appId;
    const appSecret = this.decryptAppSecret();

    if (!appId || !appSecret) {
      log.warn(`cannot provision lark-cli profile "${profile}": missing appId or appSecret`);
      return;
    }

    // Ensure both lark-cli dirs exist — the bind-mounted volumes may start
    // empty, and lark-cli won't create them (config init fails writing tmp /
    // keychain files). ~/.local/share/lark-cli is the file keychain where
    // master.key + *.enc credentials live; it's volume-mounted for persistence.
    try {
      mkdirSync(`${homedir()}/.lark-cli`, { recursive: true });
      mkdirSync(`${homedir()}/.local/share/lark-cli`, { recursive: true });
    } catch {
      // ignore — likely already exists
    }

    // `config init --name` is idempotent: "create or update a named profile
    // (append instead of replace)" per --help. Unlike `profile add`, it
    // succeeds when the profile already exists, so every boot re-writes the
    // app secret into the keychain — self-healing a secret lost by a prior
    // restart (e.g. before the keychain volume was mounted). Re-writing the
    // app secret does NOT touch existing user tokens (separate *.enc files,
    // same master.key).
    const initArgs = [
      'config',
      'init',
      '--name',
      profile,
      '--app-id',
      appId,
      '--brand',
      'feishu',
      '--app-secret-stdin'
    ];

    try {
      // App secret via stdin so it never appears in argv, the process list, or logs.
      await execFileAsync(config.larkCliPath, initArgs, {
        input: appSecret,
        encoding: 'utf8',
        timeout: 15_000
      });
      log.info(`lark-cli profile ensured: ${profile}`);
    } catch (err: any) {
      // config init failed — the config file is most likely malformed (e.g.
      // `apps: []` left behind by a prior botched remove, which lark-cli
      // refuses to load). Wipe config.json and retry once; lark-cli recreates
      // it fresh.
      log.warn(
        `config init failed (${err?.message ?? err}); resetting lark-cli config and retrying once`
      );
      this.resetLarkCliConfig();
      try {
        await execFileAsync(config.larkCliPath, initArgs, {
          input: appSecret,
          encoding: 'utf8',
          timeout: 15_000
        });
        log.info(`lark-cli profile ensured after reset: ${profile}`);
      } catch (retryErr: any) {
        log.error(
          `failed to provision lark-cli profile "${profile}" even after reset: ${retryErr?.message ?? retryErr}`
        );
      }
    }
  }

  /** Clear a malformed lark-cli config so the next `config init` starts fresh.
   *  Only removes config.json — NOT the whole `.lark-cli` dir (removing the dir
   *  breaks the bind mount to host `.docker/lark-cli` and lark-cli can't
   *  recreate it). Cache/logs/keyring store are left alone. */
  private resetLarkCliConfig(): void {
    try {
      rmSync(`${homedir()}/.lark-cli/config.json`, { force: true });
    } catch {
      // ignore
    }
  }

  /** Handle an incoming normalized message from Feishu. */
  async handleMessage(msg: NormalizedMessage): Promise<void> {
    // Ignore self-sent messages — the scheduler or a prior turn may have sent a
    // message that arrives back through the WebSocket. Matching only our own
    // open_id (not all bots) so cross-bot @-mentions still work.
    if (msg.senderIsBot && msg.senderId === this.botOpenId) return;

    const log = createLogger(this.logTag);
    log.info(
      `msg from ${msg.senderId} in ${msg.chatType}:${msg.chatId}: "${msg.content.slice(0, 80)}"`
    );

    // /clear — wipe this chat's session, confirm, and return without an LLM
    // call. Serialized per-chat so it orders AFTER any in-flight turn's save
    // (clearing before a running turn would just get re-persisted by it).
    if (parseCommand(msg.content) === 'clear') {
      await this.serializer.serialize(msg.chatId, () =>
        executeClearCommand(this.sessionMgr, this.channel, msg.chatId)
      );
      return;
    }

    await this.serializer.serialize(msg.chatId, () => this.handleTurn(msg));
  }

  /** Run one full agent turn: context build → tool loop → reply → persist.
   *  Serialized per-chat by handleMessage, so two messages in the same chat
   *  never interleave their load→LLM→save cycles. */
  private async handleTurn(msg: NormalizedMessage): Promise<void> {
    const log = createLogger(this.logTag);
    const startTime = Date.now();
    const chatId = msg.chatId;
    const chatType = msg.chatType;

    // Show a "Typing" reaction while we process, remove when done.
    let reactionId = '';
    this.channel
      .addReaction(msg.messageId, 'Typing')
      .then((rid) => {
        reactionId = rid;
      })
      .catch(() => {});

    try {
      // Build conversation context. The system prompt is re-injected fresh on
      // every call (so prompt edits hot-reload) and is NOT stored in history —
      // storing it made it accumulate one copy per turn. The current time
      // context is appended fresh each message so the model always knows "today".
      let memorySection = '';
      try {
        memorySection = renderMemorySection(await loadMemoryFacts(this.agentId));
      } catch (memErr: any) {
        // Memory must never break a turn — proceed without it.
        log.warn(`memory load failed: ${memErr?.message ?? memErr}`);
      }
      const systemPrompt = await buildSystemPrompt(this.agentRow.systemPrompt, { memorySection });
      const sessionHistory = await this.sessionMgr.load(chatId, chatType);

      // `messages` is the persisted history (system prompt is NOT included).
      const messages: Message[] = [...sessionHistory, { role: 'user', content: msg.content }];

      // Get enabled tools
      const tools = getTools();

      // Progress-aware agent loop: 6 signals replace the old
      // hardcoded for (round < maxToolCallRounds).
      const llmConfig = {
        baseUrl: this.llmRow.baseUrl,
        apiKey: decryptSecret(this.llmRow.apiKeyCipher),
        modelName: this.llmRow.modelName,
        temperature: this.llmRow.temperature ?? 0.7,
        maxTokens: this.llmRow.maxTokens ?? 8192
      };

      const loopResult = await runAgentLoop({
        chat: (msgs, tlz) => chat(llmConfig, msgs, tlz),
        executeTool,
        tools,
        systemPrompt,
        initialMessages: messages,
        policy: resolveLoopPolicy(this.llmRow),
        onInterim: async (content) => {
          try {
            await this.channel.send(chatId, { markdown: content });
          } catch {
            // Interim delivery failures must not abort the turn
          }
        },
        toolCtx: {
          profile: this.agentRow.larkCliProfile,
          appId: this.agentRow.appId,
          asUser: this.hasUserAuth,
          userOnly: false, // executeTool resolves this internally from isUserRequired
          agentId: this.agentId,
          ownerId: this.ownerId,
          chatId,
          authHooks: this.authHooks
        }
      });

      let finalResponse = loopResult.finalContent;
      const toolCallLog = loopResult.toolCallLog;
      let totalTokens = loopResult.totalTokens;

      if (loopResult.stopReason === 'final') {
        // Natural final answer — stream via streamChat for typewriter effect.
        if (!finalResponse.trim()) {
          finalResponse = '好的，已处理。';
        }

        try {
          await this.channel.stream(
            msg.chatId,
            {
              markdown: async (c) => {
                const streamingResp = await streamChat(
                  llmConfig,
                  [{ role: 'system', content: systemPrompt }, ...loopResult.messages],
                  undefined,
                  (chunk) => c.append(chunk)
                );
                if (streamingResp.content) {
                  finalResponse = streamingResp.content;
                }
                totalTokens += streamingResp.usage.totalTokens;
              }
            },
            { replyTo: msg.messageId }
          );
        } catch (sendErr: any) {
          log.error(`stream error: ${sendErr?.message ?? sendErr}`);
          try {
            await this.channel.reply(msg, { markdown: finalResponse });
          } catch {
            // best effort
          }
        }
      } else {
        // Non-final stop — run a tool-free wrap-up to report progress honestly.
        const wrapUpMessages = buildWrapUpMessages(
          systemPrompt,
          loopResult.messages,
          loopResult.stopReason
        );
        let delivered = false;
        try {
          await this.channel.stream(
            chatId,
            {
              markdown: async (c) => {
                const streamingResp = await streamChat(
                  llmConfig,
                  wrapUpMessages,
                  undefined,
                  (chunk) => c.append(chunk)
                );
                if (streamingResp.content) {
                  finalResponse = streamingResp.content;
                }
              }
            },
            { replyTo: msg.messageId }
          );
          delivered = true;
        } catch (sendErr: any) {
          log.error(`wrap-up stream failed: ${sendErr?.message ?? sendErr}`);
        }
        if (!finalResponse.trim()) {
          finalResponse = WRAP_UP_FALLBACK;
        }
        if (!delivered) {
          try {
            await this.channel.send(chatId, { markdown: finalResponse });
          } catch (sendErr: any) {
            log.error(`wrap-up fallback send failed: ${sendErr?.message ?? sendErr}`);
          }
        }
      }

      // Persist the final assistant message
      loopResult.messages.push({ role: 'assistant', content: finalResponse });

      // Persist the session with updated messages
      await this.sessionMgr.save(chatId, chatType, loopResult.messages);

      // Write execution log
      const durationMs = Date.now() - startTime;
      await writeLog({
        agentId: this.agentId,
        ownerId: this.agentRow.ownerId,
        chatId,
        type: 'message',
        messageContent: msg.content,
        responseContent: finalResponse || '(no text response)',
        toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
        tokensUsed: totalTokens,
        durationMs,
        status: 'success',
        stopReason: loopResult.stopReason
      });

      log.info(`response sent in ${durationMs}ms (${toolCallLog.length} tool calls)`);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      log.error(`handle message error: ${err?.message ?? err}`);
      // Clean up the reaction on error path too
      if (reactionId) this.channel.removeReaction(msg.messageId, reactionId).catch(() => {});
      await writeLog({
        agentId: this.agentId,
        ownerId: this.agentRow.ownerId,
        chatId,
        type: 'message',
        messageContent: msg.content,
        status: 'error',
        error: err?.message ?? String(err),
        durationMs
      });
    }

    // Remove the typing reaction when we're done
    if (reactionId) this.channel.removeReaction(msg.messageId, reactionId).catch(() => {});
  }

  /**
   * Send a message to a specific chat (not a reply to an incoming message).
   * Used by the Scheduler to deliver proactive trigger results.
   */
  async sendToChat(chatId: string, content: string): Promise<void> {
    const log = createLogger(this.logTag);
    try {
      const result = await this.channel.send(chatId, { markdown: content });
      log.info(`sent to ${chatId}: ${result.messageId}`);
    } catch (err: any) {
      log.error(`sendToChat error: ${err?.message ?? err}`);
      throw err;
    }
  }

  /** Reload this agent's config from DB (called by ConfigWatcher). */
  async reloadFromDb(): Promise<void> {
    const log = createLogger(this.logTag);

    // Always refresh user auth status — it can change independently of config
    // (e.g. user completes OAuth device flow), and AuthManager doesn't bump
    // configVersion when it transitions agent_user_auth.status to "authorized".
    await this.refreshUserAuthStatus();

    const [row] = await workerDb
      .select()
      .from(agentSchema.agent)
      .where(eq(agentSchema.agent.id, this.agentId))
      .limit(1);

    if (!row) {
      log.warn('agent row not found in DB, skipping reload');
      return;
    }

    if (row.configVersion === this.currentConfigVersion) return;

    // Reload LLM model row too
    const [llmRow] = await workerDb
      .select()
      .from(agentSchema.llmModel)
      .where(eq(agentSchema.llmModel.id, row.llmModelId))
      .limit(1);

    if (!llmRow) {
      log.warn('LLM model row not found, skipping reload');
      return;
    }

    this.agentRow = row;
    this.llmRow = llmRow;
    this.currentConfigVersion = row.configVersion;

    log.info(`config hot-reloaded (version ${row.configVersion})`);
  }

  /** Check whether this agent has an active user OAuth authorization.
   *  incremental_awaiting counts as authorized — the old token still works
   *  for its existing scopes while a new scope is being added, so --as user
   *  calls must NOT be short-circuited during the incremental window. */
  private async refreshUserAuthStatus(): Promise<void> {
    const log = createLogger(this.logTag);
    try {
      const [auth] = await workerDb
        .select()
        .from(agentSchema.agentUserAuth)
        .where(
          and(
            eq(agentSchema.agentUserAuth.agentId, this.agentId),
            inArray(agentSchema.agentUserAuth.status, ['authorized', 'incremental_awaiting'])
          )
        )
        .limit(1);

      const wasAuthorized = this.hasUserAuth;
      this.hasUserAuth = auth != null;

      if (wasAuthorized !== this.hasUserAuth) {
        log.info(`user auth status: ${this.hasUserAuth ? 'authorized' : 'not authorized'}`);
      }
    } catch (err: any) {
      // Silently treat DB errors as no auth — the tool will just return
      // the "needs authorization" message, which is safe.
      log.warn(`failed to check user auth status: ${err?.message ?? err}`);
      this.hasUserAuth = false;
    }
  }
}
