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

  it('connect() resolves once the poller starts, without awaiting the infinite poll loop', async () => {
    // Regression: the SDK's start() resolves only when the poll loop exits.
    // Awaiting it blocked connect() forever → the runtime never registered →
    // reminders failed with "agent not running" while inbound chat worked.
    let pollStartCb: (() => void) | undefined;
    const bot = fakeBot({
      login: vi.fn().mockResolvedValue({ accountId: 'b@im.bot' }),
      once: vi.fn((ev: string, cb: () => void) => {
        if (ev === 'poll:start') pollStartCb = cb;
      }) as unknown as WeChatBot['once'],
      // start() fires the captured 'poll:start' listener (setup done), then
      // returns a promise that NEVER resolves — mimicking the SDK's poll loop.
      start: vi.fn(() => {
        pollStartCb?.();
        return new Promise<void>(() => {});
      })
    });
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot });
    await expect(ch.connect()).resolves.toBeUndefined();
    expect(bot.login).toHaveBeenCalled();
    expect(bot.start).toHaveBeenCalled();
  });

  it('connect() rejects if start() fails before polling begins', async () => {
    const bot = fakeBot({
      login: vi.fn().mockResolvedValue({ accountId: 'b@im.bot' }),
      once: vi.fn(),
      start: vi.fn().mockRejectedValue(new Error('setup boom'))
    });
    const ch = new WeChatChannel({ agentId: 'a1', name: 'b', bot });
    await expect(ch.connect()).rejects.toThrow('setup boom');
  });
});
