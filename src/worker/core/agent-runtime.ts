// ============================================================
// Agent Runtime — the thinking loop for a single digital employee
// ============================================================

import { mkdirSync, rmSync } from 'node:fs';
import { execFileAsync } from './exec';
import { homedir } from 'node:os';
import type { NormalizedMessage } from '@larksuite/channel';
import { createChannel } from './platform/factory';
import { LarkChannelAdapter } from './platform/lark-channel-adapter';
import { WeChatChannel } from './platform/wechat-channel';
import type { PlatformChannel, InboundMessage, TypingHandle } from './platform/channel';
import { eq, and, inArray } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { config } from '../config';
import { createLogger } from './logger';
import { chat, type ContentBlock } from './llm';
import { streamTextInChunks, sleep } from './stream-chunk';
import { getTools, executeTool, type AuthHooks } from './tools';
import {
  runAgentLoop,
  buildWrapUpMessages,
  WRAP_UP_FALLBACK,
  TURN_ERROR_FALLBACK
} from './agent-loop';
import {
  downloadAndPrepareImages,
  downloadQuotedImages,
  mergePrepared,
  buildImageUserMessage,
  stripImagesForPersist,
  cleanupTempPaths,
  runWithVisionFallback,
  type PreparedImages
} from './image';
import { resolveQuotedContent, withQuotedMessage } from './quote';
import { resolveLoopPolicy } from './agent-policy';
import { buildSystemPrompt } from './agent-prompt';
import { loadMemoryFacts, renderMemorySection } from './agent-memory';
import { loadSkillIndex } from './skill-source';
import { parseCommand, executeClearCommand } from './commands';
import { ChatSerializer } from './chat-serializer';
import { SessionManager } from '../session/index';
import { writeLog } from './log-writer';
import { decryptSecret } from '../../lib/crypto';

type AgentRow = typeof agentSchema.agent.$inferSelect;
type LlmModelRow = typeof agentSchema.llmModel.$inferSelect;

type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
};

/** Typewriter cadence for streamReply: each streamed piece is at most this many
 *  characters, with this many ms between pieces. Local chunking of already-
 *  generated text — no model call, so what the log records is what ships. */
const STREAM_CHUNK_MAX_CHARS = 40;
const STREAM_CHUNK_DELAY_MS = 20;

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
  private channel: PlatformChannel;
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

  /** Resolved Feishu operational identity. For a Lark agent: its own creds.
   *  For a WeChat agent linked to a Lark agent: the linked agent's creds
   *  (borrowed, live-resolved — no copies). feishuAppId empty → no lark-cli. */
  private feishuAgentId: string;
  private feishuProfile: string;
  private feishuAppId: string;

  constructor(agentRow: AgentRow, llmRow: LlmModelRow) {
    this.agentRow = agentRow;
    this.llmRow = llmRow;
    this.agentId = agentRow.id;
    this.currentConfigVersion = agentRow.configVersion;
    this.logTag = `agent:${agentRow.name}`;
    this.sessionMgr = new SessionManager(agentRow.id, agentRow.ownerId);

    const appSecret = this.decryptAppSecret();

    this.channel = createChannel(agentRow, appSecret);

    // Default to own identity; resolveFeishuSource() overrides for linked agents.
    this.feishuAgentId = agentRow.id;
    this.feishuProfile = agentRow.larkCliProfile;
    this.feishuAppId = agentRow.appId;
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

  /** Resolve this agent's Feishu operational identity. For a Lark agent (or an
   *  unlinked WeChat agent) it's the agent's own appId/profile. For a WeChat
   *  agent linked to a Lark agent, it borrows the linked agent's appId/profile
   *  (and user-auth status) — single source of truth, no copied creds. Called
   *  from start() and reloadFromDb(). */
  private async resolveFeishuSource(): Promise<void> {
    const log = createLogger(this.logTag);
    const linkedId = this.agentRow.linkedAgentId;
    if (linkedId) {
      const [linked] = await workerDb
        .select()
        .from(agentSchema.agent)
        .where(eq(agentSchema.agent.id, linkedId))
        .limit(1);
      if (linked && (linked.platform ?? 'lark') === 'lark' && linked.appId) {
        this.feishuAgentId = linked.id;
        this.feishuProfile = linked.larkCliProfile;
        this.feishuAppId = linked.appId;
        return;
      }
      log.warn(
        `linked agent ${linkedId} missing, not lark, or has no appId — falling back to own identity`
      );
    }
    this.feishuAgentId = this.agentId;
    this.feishuProfile = this.agentRow.larkCliProfile;
    this.feishuAppId = this.agentRow.appId;
  }

  async start(): Promise<void> {
    const log = createLogger(this.logTag);
    log.info(`starting... (model: ${this.llmRow.modelName})`);

    // Register this agent's app credentials with lark-cli before any tool can run.
    await this.ensureLarkProfile();

    // Resolve which Feishu identity this agent uses (own vs linked) before
    // checking user auth (which is tracked under that identity).
    await this.resolveFeishuSource();

    // Check user OAuth status
    await this.refreshUserAuthStatus();

    this.channel.onMessage(async (msg: InboundMessage) => {
      try {
        await this.handleMessage(msg);
      } catch (err: any) {
        log.error(`message handler error: ${err?.message ?? err}`);
        // Don't crash the channel connection
      }
    });

    this.channel.onError((err: any) => {
      log.error(`channel error: ${err?.message ?? err}`);
    });

    // WeChat: forward SDK session-expiry (-14) to needsReauth handling.
    if (this.channel instanceof WeChatChannel) {
      this.channel.setSessionExpiredHandler(() => this.onWechatSessionExpired());
    }

    await this.channel.connect();
    // Capture this bot's own identity so handleMessage can skip self-sent
    // messages. The adapter resolves bot identity during connect().
    this.botOpenId = this.channel.getBotId();
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

  /** Handle an incoming normalized message. */
  async handleMessage(msg: InboundMessage): Promise<void> {
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
  private async handleTurn(msg: InboundMessage): Promise<void> {
    const log = createLogger(this.logTag);
    const startTime = Date.now();
    const chatId = msg.chatId;
    const chatType = msg.chatType;

    // Show a typing indicator while we process, clear when done.
    let typingHandle: TypingHandle | null = null;
    this.channel
      .beginTyping(chatId, msg.messageId)
      .then((h) => {
        typingHandle = h;
      })
      .catch(() => {});

    // Images attached to this message (null when there are none). Prepared
    // before the loop and cleaned up after it; declared out here so cleanup
    // runs even if the turn throws before/inside the loop.
    let prepared: PreparedImages | null = null;
    // Effective user-facing text (reply + any resolved quote block). Declared
    // out here so the error-path writeLog can record what the model was fed
    // even when the turn throws mid-processing.
    let userText: string = msg.content;

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
      let skillSection = '';
      try {
        skillSection = await loadSkillIndex(
          this.agentId,
          this.agentRow.ownerId,
          this.agentRow.platform ?? 'lark'
        );
      } catch (skillErr: any) {
        // Skills must never break a turn — proceed without the index.
        log.warn(`skill index load failed: ${skillErr?.message ?? skillErr}`);
      }
      const systemPrompt = await buildSystemPrompt(this.agentRow.systemPrompt, {
        memorySection,
        skillSection,
        feishuLinked: Boolean(this.feishuAppId)
      });
      const sessionHistory = await this.sessionMgr.load(chatId, chatType);

      // Image + quote ingest are Lark-specific (resource descriptors +
      // fetchMessage). Gated by platform — WeChat (T8) handles media via its
      // own adapter path. Phase A only runs the Lark branch.
      if (this.channel instanceof LarkChannelAdapter) {
        const lark = this.channel.raw;
        const larkMsg = (msg.raw ?? undefined) as NormalizedMessage | undefined;

        // Download any images the user attached. Best-effort: returns null
        // when there are none or every download failed — never breaks turn.
        if (larkMsg) prepared = await downloadAndPrepareImages(lark, larkMsg);

        // Resolve the message this reply quotes (引用消息), if any. Best-effort
        // like image ingest — a missing/forbidden quote degrades to the plain
        // reply text. Without this the agent can't see what "这个" / "上面那条"
        // refers to, because Feishu reply events carry only the new reply text.
        const quoted = larkMsg ? await resolveQuotedContent(lark, larkMsg) : null;
        userText = withQuotedMessage(quoted, msg.content);

        // If the quoted message carries images, download them too and merge
        // into `prepared` so the agent can read media it's being asked about
        // ("这张图里是啥"). Shares one MAX_IMAGES budget with the current
        // message's images (current-first). Best-effort, never breaks turn.
        if (quoted) {
          const quotedImgs = await downloadQuotedImages(lark, quoted);
          prepared = mergePrepared(prepared, quotedImgs);
        }
      }

      // `messages` is the persisted history (system prompt is NOT included).
      // Images are embedded as image_url blocks so the agent's own model can
      // read them; a temp-file path rides along in the text so the model can
      // also upload/insert them on demand. See image.ts for the fallback.
      const userMessage = buildImageUserMessage(userText, prepared, { withVision: true });
      const messages: Message[] = [...sessionHistory, userMessage];

      // Get enabled tools. lark-cli tools require a Feishu operational identity
      // (own for lark agents, borrowed for wechat agents linked to one).
      const tools = getTools(Boolean(this.feishuAppId));

      // Progress-aware agent loop: 6 signals replace the old
      // hardcoded for (round < maxToolCallRounds).
      const llmConfig = {
        baseUrl: this.llmRow.baseUrl,
        apiKey: decryptSecret(this.llmRow.apiKeyCipher),
        modelName: this.llmRow.modelName,
        temperature: this.llmRow.temperature ?? 0.7,
        maxTokens: this.llmRow.maxTokens ?? 8192
      };

      // Run the loop. If the model rejects the image with a 400 (a text-only
      // model can't read images), rebuild the user message WITHOUT the vision
      // blocks and run once more — the model can still manipulate the image as
      // a file (the temp path is in the text note). The 400 fires on round 1's
      // chat, before any tool runs, so re-running has no side effects.
      const runLoop = (initialMessages: Message[]) =>
        runAgentLoop({
          chat: (msgs, tlz) => chat(llmConfig, msgs, tlz),
          executeTool,
          tools,
          systemPrompt,
          initialMessages,
          policy: resolveLoopPolicy(this.llmRow),
          onInterim: async (content) => {
            try {
              await this.channel.sendText(chatId, content);
            } catch {
              // Interim delivery failures must not abort the turn
            }
          },
          toolCtx: {
            profile: this.feishuProfile,
            appId: this.feishuAppId,
            asUser: this.hasUserAuth,
            userOnly: false, // executeTool resolves this internally from isUserRequired
            agentId: this.agentId,
            ownerId: this.ownerId,
            chatId,
            authHooks: this.authHooks
          }
        });

      const loopResult = await runWithVisionFallback({
        run: () => runLoop(messages),
        // 400 = the agent's model can't read images. Rebuild WITHOUT vision
        // blocks and run once more, so it can still manipulate the image as a
        // file (temp path rides in the text note). The 400 fires on round 1's
        // chat, before any tool runs, so re-running has no side effects.
        fallback: () =>
          runLoop([
            ...sessionHistory,
            buildImageUserMessage(userText, prepared, { withVision: false })
          ]),
        hasImages: Boolean(prepared && prepared.imageBlocks.length > 0),
        onRetry: () => log.warn('model rejected image (HTTP 400), retrying turn without vision')
      });

      let finalResponse = loopResult.finalContent;
      const toolCallLog = loopResult.toolCallLog;
      let totalTokens = loopResult.totalTokens;

      if (loopResult.stopReason === 'final') {
        if (!finalResponse.trim()) {
          finalResponse = '好的，已处理。';
        }
        // Stream the ALREADY-GENERATED finalContent with a local typewriter
        // cadence. Do NOT re-call the model: agent-loop breaks before pushing
        // the final answer into `messages`, so a second LLM call would have to
        // re-derive it from an incomplete history — and when that second call
        // yielded no usable prose (empty content, or DSML tool-call markup the
        // stream filter strips to nothing) the channel received zero appends
        // and rendered the "(no content)" placeholder. Streaming finalContent
        // directly keeps the logged response and the delivered message identical.
        await this.streamReply(msg.chatId, finalResponse, msg.messageId);
      } else {
        // Non-final stop — the loop hit a guardrail (budget / timeout /
        // repetition / error-streak / round-ceiling). Generate ONE tool-free
        // wrap-up so the model honestly reports what got done, then deliver it
        // via streamReply so the message is never empty and never re-streams a
        // second model call straight into the channel.
        const wrapUpMessages = buildWrapUpMessages(
          systemPrompt,
          loopResult.messages,
          loopResult.stopReason
        );
        try {
          const wrapUpResp = await chat(llmConfig, wrapUpMessages);
          if (wrapUpResp.content) {
            finalResponse = wrapUpResp.content;
          }
          totalTokens += wrapUpResp.usage.totalTokens;
        } catch (wrapErr: any) {
          log.error(`wrap-up generation failed: ${wrapErr?.message ?? wrapErr}`);
        }
        if (!finalResponse.trim()) {
          finalResponse = WRAP_UP_FALLBACK;
        }
        await this.streamReply(chatId, finalResponse, msg.messageId, WRAP_UP_FALLBACK);
      }

      // Persist the final assistant message
      loopResult.messages.push({ role: 'assistant', content: finalResponse });

      // Persist the session. Strip image content blocks first so the DB never
      // stores base64 and SessionManager.truncate (which assumes string
      // content) never sees array content.
      await this.sessionMgr.save(chatId, chatType, stripImagesForPersist(loopResult.messages));

      // Write execution log
      const durationMs = Date.now() - startTime;
      await writeLog({
        agentId: this.agentId,
        ownerId: this.agentRow.ownerId,
        chatId,
        type: 'message',
        messageContent: userText,
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
      // Clear the typing indicator on error path too
      if (typingHandle) this.channel.endTyping(typingHandle).catch(() => {});
      // Don't leave the user in silence — the error is logged + recorded, but
      // without an explicit reply the chat just sees the Typing reaction vanish.
      // Best-effort: streamReply degrades to a plain send on failure and never
      // throws, so a Feishu outage here can't mask the original error handling.
      await this.streamReply(chatId, TURN_ERROR_FALLBACK, msg.messageId);
      await writeLog({
        agentId: this.agentId,
        ownerId: this.agentRow.ownerId,
        chatId,
        type: 'message',
        messageContent: userText,
        status: 'error',
        error: err?.message ?? String(err),
        durationMs
      });
    }

    // Clean up this turn's temp image files now that every tool call has
    // finished (the model may have used these paths to upload/insert images).
    if (prepared) {
      await cleanupTempPaths(prepared.tempPaths).catch(() => {});
    }

    // Clear the typing indicator when we're done
    if (typingHandle) this.channel.endTyping(typingHandle).catch(() => {});
  }

  /** Deliver an already-generated reply with a local typewriter cadence,
   *  WITHOUT re-invoking the model. Guarantees the delivered message is never
   *  empty: blank `text` falls back to `fallback`, and a streaming failure
   *  (card instance / content update / network) is retried as a single
   *  non-streaming markdown send so the turn still replies. This is what keeps
   *  the logged `finalResponse` and the message Feishu actually receives
   *  identical — the original bug was a second model call that could emit zero
   *  appends, making the channel render "(no content)". */
  private async streamReply(
    chatId: string,
    text: string,
    replyTo: string,
    fallback: string = WRAP_UP_FALLBACK
  ): Promise<void> {
    const replyLog = createLogger(this.logTag);
    const content = text.trim() || fallback;
    try {
      if (this.channel.capabilities.streaming && this.channel instanceof LarkChannelAdapter) {
        await this.channel.raw.stream(
          chatId,
          {
            markdown: async (c) => {
              await streamTextInChunks(content, (piece) => c.append(piece), sleep, {
                maxChars: STREAM_CHUNK_MAX_CHARS,
                delayMs: STREAM_CHUNK_DELAY_MS
              });
            }
          },
          { replyTo }
        );
      } else {
        // No streaming capability (WeChat): deliver the whole reply at once.
        await this.channel.sendText(chatId, content);
      }
    } catch (streamErr: any) {
      replyLog.error(`reply failed, falling back to sendText: ${streamErr?.message ?? streamErr}`);
      try {
        await this.channel.sendText(chatId, content);
      } catch (sendErr: any) {
        replyLog.error(`reply fallback sendText also failed: ${sendErr?.message ?? sendErr}`);
      }
    }
  }

  /**
   * Send a message to a specific chat (not a reply to an incoming message).
   * Used by the Scheduler to deliver proactive trigger results.
   */
  async sendToChat(chatId: string, content: string): Promise<void> {
    const log = createLogger(this.logTag);
    try {
      const result = await this.channel.sendText(chatId, content);
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
    await this.resolveFeishuSource();

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
            eq(agentSchema.agentUserAuth.agentId, this.feishuAgentId),
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

  /** Whether this agent has what it needs to connect. Lark: always true
   *  (appId/secret in DB). WeChat: requires stored SDK credentials. */
  async isProvisioned(): Promise<boolean> {
    if (this.channel instanceof WeChatChannel) return this.channel.hasCredentials();
    return true;
  }

  /** Latest needsReauth flag (agentRow is reloaded by the manager's poll). */
  isWechatNeedsReauth(): boolean {
    return Boolean((this.agentRow.platformConfig as { needsReauth?: boolean } | null)?.needsReauth);
  }

  /** WeChat session expired (-14): mark needsReauth, log, and disconnect so a
   *  fresh scan can restart the agent. The manager's poll removes it from the
   *  runtime pool once it sees needsReauth=true. */
  private async onWechatSessionExpired(): Promise<void> {
    const log = createLogger(this.logTag);
    log.error('wechat session expired (-14) — marking needsReauth, re-scan required');
    try {
      const cur = (this.agentRow.platformConfig as Record<string, unknown> | null) ?? {};
      await workerDb
        .update(agentSchema.agent)
        .set({ platformConfig: { ...cur, needsReauth: true } })
        .where(eq(agentSchema.agent.id, this.agentId));
      await writeLog({
        agentId: this.agentId,
        ownerId: this.agentRow.ownerId,
        type: 'message',
        status: 'error',
        error: 'wechat session expired (-14) — re-scan required'
      });
    } catch (err: any) {
      log.error(`failed to record wechat session expiry: ${err?.message ?? err}`);
    }
    await this.stop().catch(() => {});
  }
}
