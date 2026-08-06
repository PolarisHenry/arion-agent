// ============================================================
// PlatformChannel — platform-agnostic seam for inbound/outbound
// messaging. AgentRuntime depends only on this interface; each
// platform (Lark, WeChat, future DingTalk/WeCom) implements it.
// ============================================================

export type Platform = 'lark' | 'wechat';

/** An image attached to a message. Adapters normalize platform-specific
 *  media refs into one of these (a fetchable URL, or an in-memory buffer). */
export interface InboundImage {
  url?: string;
  buffer?: Buffer;
  mimeType?: string;
}

/** A normalized inbound message. Both Lark's NormalizedMessage and WeChat's
 *  SDK message map to this shape so AgentRuntime is platform-agnostic. */
export interface InboundMessage {
  chatId: string;
  chatType: 'p2p' | 'group';
  messageId: string;
  senderId: string;
  senderIsBot: boolean;
  content: string;
  images?: InboundImage[];
  replyQuote?: { content: string; images?: InboundImage[] };
  /** Platform-native message, carried opaquely for platform-specific
   *  processing the abstraction doesn't yet cover (e.g. Lark image resource
   *  descriptors, replyToMessageId). Adapters may populate this; consumers
   *  cast to their platform's native type. */
  raw?: unknown;
}

/** Opaque handle returned by beginTyping, passed back to endTyping. Each
 *  adapter stashes whatever it needs: Lark stores {messageId, token=reactionId},
 *  WeChat stores {chatId=userId} (and may send status:2 on end). */
export interface TypingHandle {
  chatId: string;
  messageId?: string;
  token?: string;
}

export interface ChannelCapabilities {
  /** True when the platform supports live-updating streaming replies
   *  (Lark interactive cards). WeChat has none — falls back to one-shot send. */
  streaming: boolean;
  /** True when the platform supports message reactions (Lark). */
  reactions: boolean;
}

export interface PlatformChannel {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(cb: (m: InboundMessage) => void): void;
  onError(cb: (e: unknown) => void): void;
  /** This bot's own id, used to skip self-sent messages. */
  getBotId(): string;

  sendText(chatId: string, text: string): Promise<{ messageId: string }>;
  sendImage?(chatId: string, img: InboundImage): Promise<{ messageId: string }>;

  /** Show a "typing" indicator. messageId is the inbound message id (Lark needs
   *  it for addReaction); WeChat ignores it (uses chatId as the user id). */
  beginTyping(chatId: string, messageId?: string): Promise<TypingHandle>;
  endTyping(handle: TypingHandle): Promise<void>;

  readonly capabilities: ChannelCapabilities;
}
