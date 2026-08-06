import { describe, it, expect } from 'vitest';
import { parseCommand, executeClearCommand } from './commands';

describe('parseCommand', () => {
  it('detects /clear', () => {
    expect(parseCommand('/clear')).toBe('clear');
  });

  it('is case-insensitive', () => {
    expect(parseCommand('/Clear')).toBe('clear');
    expect(parseCommand('/CLEAR')).toBe('clear');
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCommand('  /clear ')).toBe('clear');
    expect(parseCommand('/clear\n')).toBe('clear');
  });

  it('returns null for lookalikes and ordinary text', () => {
    expect(parseCommand('/clearing')).toBeNull();
    expect(parseCommand('/clear 一下')).toBeNull();
    expect(parseCommand('帮我 /clear')).toBeNull();
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('你好')).toBeNull();
  });
});

describe('executeClearCommand', () => {
  it('clears the session, then sends the confirmation', async () => {
    const calls: string[] = [];
    const sessionMgr = {
      clear: async () => {
        calls.push('clear');
      }
    };
    const channel = {
      sendText: async () => {
        calls.push('sendText');
        return { messageId: 'm1' };
      }
    };

    await executeClearCommand(sessionMgr as any, channel as any, 'chat-1');

    expect(calls).toEqual(['clear', 'sendText']);
  });

  it('sends the confirmation text via sendText', async () => {
    const sent: string[] = [];
    const channel = {
      sendText: async (_chatId: string, text: string) => {
        sent.push(text);
        return { messageId: 'm1' };
      }
    };

    await executeClearCommand({ clear: async () => {} } as any, channel as any, 'chat-1');

    expect(sent).toEqual(['🧹 上下文已清空，我们重新开始吧。']);
  });

  it('does not throw when the confirmation send fails (clear already happened)', async () => {
    const calls: string[] = [];
    const sessionMgr = {
      clear: async () => {
        calls.push('clear');
      }
    };
    const channel = {
      sendText: async () => {
        throw new Error('network down');
      }
    };

    await expect(
      executeClearCommand(sessionMgr as any, channel as any, 'chat-1')
    ).resolves.toBeUndefined();
    expect(calls).toEqual(['clear']);
  });
});
