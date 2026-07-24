import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Integration test — auth-replay `--as user` path
// ------------------------------------------------------------
// Regression guard for the bug where runProactiveTurn never set
// `asUser` on the toolCtx, so executeTool's reactive-auth guard
// short-circuited the retried `--as user` call and the replay loop
// never actually closed (markRetry('done') recorded a false success).
//
// Unlike proactive-runner.test.ts, this file does NOT mock
// runProactiveTurn / executeTool / runAgentLoop / lark-executor —
// they run for real. We mock only the boundaries: worker-db (rows),
// llm chat (canned tool_call then a final answer), the exec
// subprocess, the prompt builder, the log writer, crypto, and config.
//
// If asUser is ever unset again, executeTool returns the
// "需要用户授权" string instead of calling exec, so the
// `execFileAsync` assertion below fails.
// ============================================================

const agentRow = {
  id: 'a1',
  ownerId: 'o1',
  llmModelId: 'm1',
  appId: 'app',
  larkCliProfile: 'prof',
  systemPrompt: 'sys',
  status: 'active'
};
const llmRow = {
  id: 'm1',
  baseUrl: 'http://x',
  apiKeyCipher: 'cipher',
  modelName: 'm',
  temperature: 0.7,
  maxTokens: 4096
};
const authRowAuthorized = { id: 'au1', agentId: 'a1', status: 'authorized' };

// vi.hoisted so the fn refs exist when the hoisted vi.mock factories run.
const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
const { chatFn } = vi.hoisted(() => ({ chatFn: vi.fn() }));
const { execFileAsync } = vi.hoisted(() => ({ execFileAsync: vi.fn() }));

// workerDb.select() chains all resolve through one shared limit() whose Nth
// call returns the Nth row. runProactiveTurn issues exactly 3 selects in
// order: agent → llmModel → agentUserAuth.
vi.mock('../worker-db', () => ({
  workerDb: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit }))
      }))
    }))
  },
  agentSchema: {
    agent: { id: 'id', status: 'status' },
    llmModel: { id: 'id' },
    agentUserAuth: { agentId: 'agentId', status: 'status' }
  }
}));
vi.mock('./llm', () => ({ chat: (...a: any[]) => chatFn(...a) }));
vi.mock('./exec', () => ({ execFileAsync }));
vi.mock('./agent-prompt', () => ({ buildSystemPrompt: async () => 'sys' }));
vi.mock('./log-writer', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/crypto', () => ({ decryptSecret: () => 'k' }));
vi.mock('../config', () => ({
  config: {
    larkCliPath: '/usr/local/bin/lark-cli',
    agentLoop: {
      maxRounds: 5,
      maxTokens: 100_000,
      maxWallMs: 60_000,
      maxRepeats: 3,
      maxConsecutiveErrors: 3
    }
  }
}));

import { runProactiveTurn } from './proactive-runner';

describe('runProactiveTurn — auth replay `--as user` path (integration)', () => {
  beforeEach(() => {
    // 3 selects: agent, llm, authorized auth row → asUser true.
    limit
      .mockReset()
      .mockResolvedValueOnce([agentRow])
      .mockResolvedValueOnce([llmRow])
      .mockResolvedValueOnce([authRowAuthorized])
      .mockResolvedValue([]);

    execFileAsync.mockReset();
    execFileAsync.mockResolvedValue({ stdout: '{"ok":true}', stderr: '' });

    // Round 1: LLM retries the original `--as user` call.
    // Round 2: no tool_calls → final answer.
    chatFn
      .mockReset()
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tc1',
            name: 'run_lark_cli',
            arguments: JSON.stringify({
              argv: ['calendar', '+agenda', '--as', 'user']
            })
          }
        ],
        finishReason: 'tool_calls',
        usage: { totalTokens: 10 }
      })
      .mockResolvedValueOnce({
        content: 'done',
        toolCalls: [],
        finishReason: 'stop',
        usage: { totalTokens: 5 }
      });
  });

  it('lets the retried `--as user` call reach exec (asUser derived from auth row)', async () => {
    const sendFn = vi.fn();
    const r = await runProactiveTurn({
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      userMessage: '继续',
      sendFn
    });

    // exec was called → executeTool did NOT short-circuit on the `--as user`
    // guard. (With asUser unset, executeTool returns the "需要用户授权" string
    // and exec is never reached — this assertion would fail.)
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(execFileAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['--as', 'user']),
      expect.any(Object)
    );
    // Final answer reached the user.
    expect(r.finalContent).toBe('done');
    expect(sendFn).toHaveBeenCalledWith('a1', 'c1', 'done');
  });

  it('short-circuits the `--as user` call when the agent has NO user auth', async () => {
    // No agent_user_auth row → asUser false → executeTool returns the
    // "needs authorization" string → exec never reached.
    limit
      .mockReset()
      .mockResolvedValueOnce([agentRow])
      .mockResolvedValueOnce([llmRow])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    await runProactiveTurn({
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      userMessage: '继续',
      sendFn: vi.fn()
    });

    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('treats incremental_awaiting as authorized (old token still works mid-flow)', async () => {
    limit
      .mockReset()
      .mockResolvedValueOnce([agentRow])
      .mockResolvedValueOnce([llmRow])
      .mockResolvedValueOnce([{ id: 'au1', agentId: 'a1', status: 'incremental_awaiting' }])
      .mockResolvedValue([]);

    await runProactiveTurn({
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      userMessage: '继续',
      sendFn: vi.fn()
    });

    expect(execFileAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['--as', 'user']),
      expect.any(Object)
    );
  });
});
