// ============================================================
// LarkChannelAdapter — wraps @larksuite/channel's LarkChannel behind
// the platform-agnostic PlatformChannel interface. AgentRuntime talks
// only to PlatformChannel; this is the Feishu implementation.
// ============================================================

import type { LarkChannel, NormalizedMessage } from '@larksuite/channel';
import type { PlatformChannel, InboundMessage, TypingHandle } from './channel';

/** Map Lark's NormalizedMessage into our platform-agnostic InboundMessage.
 *  Lark-specific image/quote fields pass through when present. */
export function normalizeLarkMessage(m: NormalizedMessage): InboundMessage {
  return {
    chatId: m.chatId,
    chatType: m.chatType,
    messageId: m.messageId,
    senderId: m.senderId,
    senderIsBot: m.senderIsBot ?? false,
    content: m.content,
    // Lark SDK exposes attached images / quoted message via extra fields the
    // worker reads in image.ts / quote.ts; pass them through opaquely.
    images: (m as NormalizedMessage & { images?: InboundMessage['images'] }).images,
    replyQuote: (m as NormalizedMessage & { replyQuote?: InboundMessage['replyQuote'] }).replyQuote,
    // Carry the native NormalizedMessage so the runtime's Lark image/quote
    // paths (which need msg.resources / msg.replyToMessageId) still work.
    raw: m
  };
}

export class LarkChannelAdapter implements PlatformChannel {
  readonly capabilities = { streaming: true, reactions: true };
  private botOpenId = '';

  constructor(private readonly inner: LarkChannel) {}

  async connect(): Promise<void> {
    await this.inner.connect();
    // Bot identity is only resolved after the WS handshake (see agent-runtime).
    this.botOpenId = this.inner.getBotIdentity().openId;
  }
  async disconnect(): Promise<void> {
    await this.inner.disconnect();
  }

  onMessage(cb: (m: InboundMessage) => void): void {
    this.inner.on('message', (m: NormalizedMessage) => cb(normalizeLarkMessage(m)));
  }
  onError(cb: (e: unknown) => void): void {
    this.inner.on('error', cb);
  }

  getBotId(): string {
    return this.botOpenId;
  }

  async sendText(chatId: string, text: string): Promise<{ messageId: string }> {
    const r = await this.inner.send(chatId, { markdown: text });
    return { messageId: r.messageId };
  }

  async beginTyping(chatId: string, messageId?: string): Promise<TypingHandle> {
    // Lark's typing indicator is a "Typing" emoji reaction on the message.
    if (!messageId) return { chatId };
    const token = await this.inner.addReaction(messageId, 'Typing').catch(() => '');
    return { chatId, messageId, token };
  }
  async endTyping(handle: TypingHandle): Promise<void> {
    if (handle.messageId && handle.token) {
      await this.inner.removeReaction(handle.messageId, handle.token).catch(() => {});
    }
  }

  /** The underlying LarkChannel, for Lark-only capabilities the runtime still
   *  uses directly (streaming cards). Accessed via `capabilities.streaming`. */
  get raw(): LarkChannel {
    return this.inner;
  }
}
