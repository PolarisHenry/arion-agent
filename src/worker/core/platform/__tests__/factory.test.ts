import { describe, it, expect } from 'vitest';
import { createChannel } from '../factory';

describe('createChannel', () => {
  it('returns a Lark channel for platform lark', () => {
    const ch = createChannel({ id: 'a1', platform: 'lark', appId: 'cli_x', name: 'bot' }, 'secret');
    expect(ch.capabilities).toEqual({ streaming: true, reactions: true });
  });

  it('defaults to lark when platform is null', () => {
    const ch = createChannel({ id: 'a1', platform: null, appId: 'cli_x', name: 'bot' }, 'secret');
    expect(ch.capabilities.streaming).toBe(true);
  });

  it('defaults to lark when platform is undefined', () => {
    const ch = createChannel({ id: 'a1', appId: 'cli_x', name: 'bot' }, 'secret');
    expect(ch.capabilities.reactions).toBe(true);
  });

  it('throws on unsupported platform', () => {
    expect(() => createChannel({ id: 'a1', platform: 'nope', appId: 'x', name: 'b' }, 's')).toThrow(
      /platform/
    );
  });

  it('returns a WeChat channel (no streaming) for platform wechat', () => {
    const ch = createChannel({ id: 'a1', platform: 'wechat', appId: null, name: 'b' }, 's');
    expect(ch.capabilities).toEqual({ streaming: false, reactions: false });
  });
});
