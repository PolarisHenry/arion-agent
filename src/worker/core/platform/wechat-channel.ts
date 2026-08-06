// ============================================================
// WeChatChannel — wraps @wechatbot/wechatbot behind the
// platform-agnostic PlatformChannel interface. The WeChat (iLink)
// implementation; AgentRuntime talks only to PlatformChannel.
//
// The SDK owns the gnarly bits: context_token persistence/echo, the
// getupdates long-poll cursor, AES-128-ECB media, the typing two-step
// (getconfig→ticket→sendtyping), and -14 session recovery.
// ============================================================

import { homedir } from 'node:os';
import { join } from 'node:path';
import { WeChatBot, type IncomingMessage } from '@wechatbot/wechatbot';
import type { PlatformChannel, InboundMessage, TypingHandle } from './channel';

/** Per-agent storage dir for the SDK's file backend (credentials, cursor,
 *  context_tokens, typing_tickets). Volume-mount this for persistence —
 *  mirrors the lark-cli keychain pattern. */
export function storageDirFor(agentId: string): string {
  return join(process.env.WECHATBOT_DATA_DIR ?? `${homedir()}/.wechatbot`, agentId);
}

/** Map the SDK's IncomingMessage into our platform-agnostic InboundMessage.
 *  WeChat is DM-only (chatType always p2p) and inbound is always from a user
 *  (senderIsBot false — the bot's own sends never echo back as inbound). */
export function normalizeWechatMessage(msg: IncomingMessage): InboundMessage {
  return {
    chatId: msg.userId,
    chatType: 'p2p',
    messageId: String((msg.raw as { message_id?: number | string } | undefined)?.message_id ?? ''),
    senderId: msg.userId,
    senderIsBot: false,
    content: msg.text ?? '',
    // v1: WeChat image ingest is not wired (the runtime's image pipeline is
    // Lark-specific). msg.text already carries "[image]" for media, so the
    // agent at least knows an image arrived. Full media ingest = follow-up.
    raw: msg
  };
}

export interface WeChatChannelOptions {
  agentId: string;
  name: string;
  /** Defaults to storageDirFor(agentId). */
  storageDir?: string;
  /** @internal — inject a fake WeChatBot for unit tests. */
  bot?: WeChatBot;
}

export class WeChatChannel implements PlatformChannel {
  readonly capabilities = { streaming: false, reactions: false };
  private readonly bot: WeChatBot;
  private sessionExpiredHandler?: () => void | Promise<void>;

  constructor(opts: WeChatChannelOptions) {
    this.bot =
      opts.bot ??
      new WeChatBot({
        storageDir: opts.storageDir ?? storageDirFor(opts.agentId),
        botAgent: `arion-agent/${opts.name}`
      });
    // SDK emits 'session:expired' on -14 (creds dead — re-scan required).
    // Forward to a handler the runtime installs to mark needsReauth + stop.
    this.bot.on('session:expired', () => this.sessionExpiredHandler?.());
  }

  /** Install the session-expiry callback (-14 → needsReauth). Set before
   *  connect() so it's in place before polling begins. */
  setSessionExpiredHandler(cb: () => void | Promise<void>): void {
    this.sessionExpiredHandler = cb;
  }

  /** Whether the SDK storage holds credentials for this bot (agent provisioned
   *  via dashboard scan). The worker guards on this before connecting so an
   *  unprovisioned agent doesn't block on login()'s QR flow. */
  async hasCredentials(): Promise<boolean> {
    const creds = await this.bot.storage.get<{ token?: string }>('credentials');
    return Boolean(creds?.token);
  }

  async connect(): Promise<void> {
    // login() resumes from stored credentials (no QR) when the agent was
    // provisioned via the dashboard. Worker must not reach here for an
    // unprovisioned agent — see agent-manager guard (T11).
    await this.bot.login();
    // The SDK's start() resolves only when the poll loop EXITS — it's designed
    // as a program's main loop (run forever). Awaiting it blocks connect()
    // forever, so AgentRuntime.start() never returned, the runtime was never
    // registered in the pool, and the scheduler's sendForAgent always failed
    // with "agent not running" (even though inbound chat worked, since the
    // poller runs independently). Kick the loop off in the background and
    // resolve connect() once setup is done — the SDK emits 'poll:start' after
    // context/cursor load, right before the loop begins.
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onPollStart = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      this.bot.once('poll:start', onPollStart);
      this.bot.start().catch((err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }
  async disconnect(): Promise<void> {
    this.bot.stop();
  }

  onMessage(cb: (m: InboundMessage) => void): void {
    this.bot.onMessage((msg) => cb(normalizeWechatMessage(msg)));
  }
  onError(cb: (e: unknown) => void): void {
    this.bot.on('error', cb);
  }

  /** The bot's own @im.bot id (for self-message skip; inbound is always
   *  from users on WeChat, so this rarely matters). Empty before login. */
  getBotId(): string {
    return this.bot.getCredentials()?.accountId ?? '';
  }

  /** Send by userId. The SDK replays the cached context_token for that user
   *  (they must have messaged first). WeChat's sendmessage returns no id. */
  async sendText(chatId: string, text: string): Promise<{ messageId: string }> {
    await this.bot.send(chatId, text);
    return { messageId: '' };
  }

  async beginTyping(chatId: string): Promise<TypingHandle> {
    // SDK handles getconfig→typing_ticket→sendtyping internally + caches the ticket.
    await this.bot.sendTyping(chatId).catch(() => {});
    return { chatId };
  }
  async endTyping(handle: TypingHandle): Promise<void> {
    await this.bot.stopTyping(handle.chatId).catch(() => {});
  }

  /** The underlying WeChatBot — used by T11 (session:expired → needsReauth)
   *  and the dashboard login route (T9). */
  get raw(): WeChatBot {
    return this.bot;
  }
}
