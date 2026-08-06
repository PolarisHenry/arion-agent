import { describe, it, expect, vi } from 'vitest';

// Mocks — keep the unit test off the real DB, LLM, tools, and crypto.
vi.mock('../worker-db', () => ({
  workerDb: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'a1',
              ownerId: 'o1',
              llmModelId: 'm1',
              appId: 'app',
              larkCliProfile: 'prof',
              systemPrompt: 'sys',
              status: 'active',
              platform: 'lark',
              linkedAgentId: null
            }
          ])
        })
      })
    })
  },
  agentSchema: {
    agent: { id: 'id', status: 'status' },
    llmModel: { id: 'id' },
    agentUserAuth: { agentId: 'agentId', status: 'status' }
  }
}));
vi.mock('./llm', () => ({
  chat: vi.fn().mockResolvedValue({
    content: 'done',
    toolCalls: [],
    usage: { totalTokens: 1 }
  })
}));
vi.mock('./tools', () => ({ getTools: () => [], executeTool: vi.fn() }));
vi.mock('./agent-prompt', () => ({ buildSystemPrompt: async () => 'sys' }));
vi.mock('./log-writer', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/crypto', () => ({ decryptSecret: () => 'k' }));

import { runProactiveTurn } from './proactive-runner';
import { writeLog } from './log-writer';

describe('runProactiveTurn', () => {
  it('runs a tool-free round and returns final content', async () => {
    const sendFn = vi.fn();
    const r = await runProactiveTurn({
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      chatType: 'p2p',
      userMessage: '继续',
      sendFn
    });
    expect(r.finalContent).toBe('done');
    expect(r.stopReason).toBe('final');
    expect(sendFn).toHaveBeenCalledWith('a1', 'c1', 'done');
  });

  it('does not call sendFn for a targetless trigger (chatId undefined)', async () => {
    const sendFn = vi.fn();
    const r = await runProactiveTurn({
      agentId: 'a1',
      ownerId: 'o1',
      chatId: undefined,
      chatType: 'trigger',
      userMessage: 'hi',
      sendFn
    });
    // Final content still produced, but no real target → send skipped.
    expect(r.finalContent).toBe('done');
    expect(sendFn).not.toHaveBeenCalled();
    // Success log row still written, with the 'trigger' audit fallback.
    expect(writeLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        chatId: 'trigger'
      })
    );
  });
});
