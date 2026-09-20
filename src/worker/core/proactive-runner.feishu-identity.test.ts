import { describe, it, expect, vi } from 'vitest';

// ============================================================
// Regression guard — linked WeChat agent identity in proactive turns
// ------------------------------------------------------------
// Bug (2026-09-20, 车贷记账 scheduled task): runProactiveTurn passed
// `profile: agentRow.larkCliProfile` into the toolCtx. For a WeChat agent
// linked to a Lark agent, that own profile (`agent-<wechatId>`) is never
// provisioned in lark-cli — the message path runs lark tools under the
// LINKED agent's profile (AgentRuntime.resolveFeishuSource →
// this.feishuProfile). Every scheduled lark-cli call died with
// `profile "agent-…" not found` while interactive turns (补记) worked.
//
// This test pins the contract: profile/appId come from the linked Lark
// agent, and asUser derives from the LINKED agent's auth row (user auth is
// tracked under the Feishu identity, not the WeChat agent's own id).
// ============================================================

const wechatAgent = {
  id: 'wx1',
  ownerId: 'o1',
  llmModelId: 'm1',
  appId: null,
  larkCliProfile: 'agent-wx1',
  systemPrompt: 'sys',
  status: 'active',
  platform: 'wechat',
  linkedAgentId: 'lark1'
};
const linkedLarkAgent = {
  id: 'lark1',
  ownerId: 'o1',
  llmModelId: 'm9',
  appId: 'cli_linked',
  larkCliProfile: 'agent-lark1',
  systemPrompt: 'sys',
  status: 'active',
  platform: 'lark',
  linkedAgentId: null
};
const llmRow = {
  id: 'm1',
  baseUrl: 'http://x',
  apiKeyCipher: 'c',
  modelName: 'm',
  temperature: 0.7,
  maxTokens: 4096
};
const linkedAuthRow = { id: 'au1', agentId: 'lark1', status: 'authorized' };

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
const { runAgentLoop } = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

// workerDb.select() chains all resolve through one shared limit() whose Nth
// call returns the Nth row. Selects in order for a linked wechat agent:
// agent → llmModel → linked agent → agentUserAuth.
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
vi.mock('./llm', () => ({ chat: vi.fn() }));
vi.mock('./tools', () => ({ getTools: vi.fn(() => []), executeTool: vi.fn() }));
vi.mock('./agent-prompt', () => ({ buildSystemPrompt: async () => 'sys' }));
vi.mock('./log-writer', () => ({ writeLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/crypto', () => ({ decryptSecret: () => 'k' }));
vi.mock('./agent-loop', () => ({
  runAgentLoop: (...a: unknown[]) => runAgentLoop(...(a as Parameters<typeof runAgentLoop>)),
  buildWrapUpMessages: () => [],
  WRAP_UP_FALLBACK: 'fallback'
}));

import { runProactiveTurn } from './proactive-runner';
import { getTools } from './tools';

describe('runProactiveTurn — linked WeChat agent Feishu identity', () => {
  it('runs lark tools under the LINKED agent profile/appId and auth', async () => {
    limit
      .mockReset()
      .mockResolvedValueOnce([wechatAgent])
      .mockResolvedValueOnce([llmRow])
      .mockResolvedValueOnce([linkedLarkAgent])
      .mockResolvedValueOnce([linkedAuthRow]);
    runAgentLoop.mockResolvedValue({
      finalContent: 'ok',
      stopReason: 'final',
      totalTokens: 1,
      messages: [],
      toolCallLog: []
    });

    await runProactiveTurn({ agentId: 'wx1', userMessage: '记账' });

    const ctx = runAgentLoop.mock.calls[0][0].toolCtx;
    expect(ctx.profile).toBe('agent-lark1'); // NOT the wechat agent's own 'agent-wx1'
    expect(ctx.appId).toBe('cli_linked');
    expect(ctx.asUser).toBe(true); // from the LINKED agent's auth row
    expect(getTools).toHaveBeenCalledWith(true); // feishuLinked resolved via linked agent
  });
});
