import { describe, it, expect } from 'vitest';
import { normalizeLarkMessage } from '../lark-channel-adapter';
import type { NormalizedMessage } from '@larksuite/channel';

describe('normalizeLarkMessage', () => {
  it('maps a p2p text message through to InboundMessage', () => {
    const larkMsg = {
      messageId: 'om_123',
      chatId: 'oc_abc',
      chatType: 'p2p',
      senderId: 'ou_sender',
      senderIsBot: false,
      content: '你好'
    } as NormalizedMessage;

    const m = normalizeLarkMessage(larkMsg);

    expect(m).toMatchObject({
      messageId: 'om_123',
      chatId: 'oc_abc',
      chatType: 'p2p',
      senderId: 'ou_sender',
      senderIsBot: false,
      content: '你好'
    });
  });

  it('maps group chatType through', () => {
    const m = normalizeLarkMessage({ chatType: 'group', content: 'hi' } as NormalizedMessage);
    expect(m.chatType).toBe('group');
  });

  it('passes through images and replyQuote when present', () => {
    const images = [{ url: 'https://x/a.png' }];
    const replyQuote = { content: 'quoted' };
    const m = normalizeLarkMessage({
      chatId: 'c',
      chatType: 'p2p',
      content: 'see this',
      images,
      replyQuote
    } as unknown as NormalizedMessage);

    expect(m.images).toEqual(images);
    expect(m.replyQuote).toEqual(replyQuote);
  });
});
