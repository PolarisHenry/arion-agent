import { describe, it, expect } from 'vitest';
import { withQuotedMessage, resolveQuotedContent, MAX_QUOTE_CHARS } from './quote';
import type { LarkChannel, NormalizedMessage } from '@larksuite/channel';

function mockChannel(
  fetchMessage: (
    id: string
  ) => NormalizedMessage | undefined | Promise<NormalizedMessage | undefined>
): LarkChannel {
  return { fetchMessage } as unknown as LarkChannel;
}

function msgWithReply(replyToMessageId?: string): NormalizedMessage {
  return { content: 'hello', replyToMessageId } as unknown as NormalizedMessage;
}

describe('withQuotedMessage', () => {
  it('returns reply text unchanged when there is no quote', () => {
    expect(withQuotedMessage(null, 'reply')).toBe('reply');
  });

  it('returns reply text unchanged when quote content is empty/whitespace', () => {
    expect(withQuotedMessage({ content: '   \n' }, 'reply')).toBe('reply');
    expect(withQuotedMessage({ content: '' }, 'reply')).toBe('reply');
  });

  it('prepends a [引用消息] block before the reply', () => {
    expect(withQuotedMessage({ content: 'earlier' }, 'reply')).toBe('[引用消息]\nearlier\n\nreply');
  });

  it('includes the sender name when present', () => {
    expect(withQuotedMessage({ content: 'earlier', senderName: '张三' }, 'reply')).toBe(
      '[引用张三 的消息]\nearlier\n\nreply'
    );
  });

  it('truncates quoted content longer than MAX_QUOTE_CHARS', () => {
    const long = 'x'.repeat(MAX_QUOTE_CHARS * 2);
    const out = withQuotedMessage({ content: long }, 'reply');
    expect(out).toContain('…（已截断）');
    // The kept body is exactly the cap, with the truncation marker appended.
    const body = out.split('\n')[1];
    expect(body).toBe('x'.repeat(MAX_QUOTE_CHARS) + '…（已截断）');
    expect(out.endsWith('\n\nreply')).toBe(true);
  });

  it('keeps full content when exactly at the cap', () => {
    const exact = 'y'.repeat(MAX_QUOTE_CHARS);
    const out = withQuotedMessage({ content: exact }, 'reply');
    expect(out).not.toContain('已截断');
    expect(out).toContain(exact);
  });
});

describe('resolveQuotedContent', () => {
  it('returns null when the message has no replyToMessageId', async () => {
    const ch = mockChannel(() => ({ content: 'x' }) as NormalizedMessage);
    expect(await resolveQuotedContent(ch, msgWithReply(undefined))).toBeNull();
  });

  it('returns trimmed content + senderName when fetch succeeds', async () => {
    const ch = mockChannel(
      () => ({ content: ' quoted text ', senderName: '李四' }) as NormalizedMessage
    );
    expect(await resolveQuotedContent(ch, msgWithReply('mid-q'))).toEqual({
      content: 'quoted text',
      senderName: '李四'
    });
  });

  it('returns null when fetchMessage resolves undefined', async () => {
    const ch = mockChannel(() => undefined);
    expect(await resolveQuotedContent(ch, msgWithReply('mid-q'))).toBeNull();
  });

  it('returns null and never throws when fetchMessage rejects', async () => {
    const ch = mockChannel(() => Promise.reject(new Error('boom')));
    await expect(resolveQuotedContent(ch, msgWithReply('mid-q'))).resolves.toBeNull();
  });
});
