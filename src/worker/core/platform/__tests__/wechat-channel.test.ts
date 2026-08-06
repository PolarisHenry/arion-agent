import { describe, it, expect, vi } from 'vitest';
import { normalizeWechatMessage, WeChatChannel } from '../wechat-channel';
import type { InboundMessage } from '../channel';
import type { IncomingMessage, WeChatBot } from '@wechatbot/wechatbot';

const fakeIncoming = (over: Partial<IncomingMessage> = {}): IncomingMessage =>
  ({
    userId: 'ou_x@im.wechat',
    text: '你好',
    type: 'text',
    timestamp: new Date(),
    images: [],
    voices: [],
    files: [],
    videos: [],
    raw: { message_id: 123 },
    _contextToken: 'tok',
    ...over
  }) as IncomingMessage;

describe('normalizeWechatMessage', () => {
  it('maps userId/text to a p2p InboundMessage from a user', () => {
    const m = normalizeWechatMessage(fakeIncoming());
    expect(m).toMatchObject({
      chatId: 'ou_x@im.wechat',
      senderId: 'ou_x@im.wechat',
      chatType: 'p2p',
      senderIsBot: false,
      content: '你好',
      messageId: '123'
    });
  });

  it('carries the native message as raw', () => {
    const m = normalizeWechatMessage(fakeIncoming());
    expect(m.raw).toBeDefined();
  });
});

describe('WeChatChannel', () => {
  const fakeBot = (over: Partial<WeChatBot> = {}) =>
    ({
      send: vi.fn().mockResolvedValue(undefined),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      stopTyping: vi.fn().mockResolvedValue(undefined),
      getCredentials: vi.fn().mockReturnValue({ accountId: 'b@im.bot' }),
      // WeChatChannel subscribes to 'session:expired' in its constructor.
      on: vi.fn().mockReturnThis(),
      ...over
    }) as unknown as WeChatBot;

  it('capabilities: no streaming, no reactions', () => {
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot: fakeBot() });
    expect(ch.capabilities).toEqual({ streaming: false, reactions: false });
  });

  it('sendText calls bot.send(userId, text) and returns empty messageId', async () => {
    const bot = fakeBot();
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot });
    const r = await ch.sendText('ou_x@im.wechat', 'hi');
    expect(bot.send).toHaveBeenCalledWith('ou_x@im.wechat', 'hi');
    expect(r.messageId).toBe('');
  });

  it('beginTyping calls bot.sendTyping(userId)', async () => {
    const bot = fakeBot();
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot });
    await ch.beginTyping('ou_x@im.wechat');
    expect(bot.sendTyping).toHaveBeenCalledWith('ou_x@im.wechat');
  });

  it('endTyping calls bot.stopTyping(chatId)', async () => {
    const bot = fakeBot();
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot });
    await ch.endTyping({ chatId: 'ou_x@im.wechat' });
    expect(bot.stopTyping).toHaveBeenCalledWith('ou_x@im.wechat');
  });

  it('getBotId reads accountId from credentials', () => {
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot: fakeBot() });
    expect(ch.getBotId()).toBe('b@im.bot');
  });

  it('onMessage normalizes each SDK message', () => {
    let registered: ((m: IncomingMessage) => void) | undefined;
    const bot = fakeBot({
      onMessage: ((h: (m: IncomingMessage) => void) => {
        registered = h;
      }) as WeChatBot['onMessage']
    });
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot });
    const received: InboundMessage[] = [];
    ch.onMessage((m) => received.push(m));
    expect(registered).toBeDefined();
    registered!(fakeIncoming({ text: 'hello' }));
    expect(received[0]).toMatchObject({ content: 'hello', chatId: 'ou_x@im.wechat' });
  });
});
