import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./agent-memory', () => ({
  saveMemoryFact: vi.fn(),
  getMemoryFact: vi.fn(),
  listMemoryFacts: vi.fn(),
  deleteMemoryFact: vi.fn(),
  loadMemoryFacts: vi.fn(),
  renderMemorySection: vi.fn(() => '')
}));

vi.mock('./lark-executor', () => ({
  runLarkCli: vi.fn(async () => 'ok'),
  readSkill: vi.fn(async () => 'skill content'),
  larkSchema: vi.fn(async () => 'schema')
}));

import { getTools, executeTool } from './tools';
import { larkCliRequiresUser } from './lark-tools';
import { saveMemoryFact, getMemoryFact, listMemoryFacts, deleteMemoryFact } from './agent-memory';
import { readSkill, runLarkCli } from './lark-executor';

beforeEach(() => {
  saveMemoryFact.mockReset();
  getMemoryFact.mockReset();
  listMemoryFacts.mockReset();
  deleteMemoryFact.mockReset();
  readSkill.mockReset();
  readSkill.mockResolvedValue('skill content');
  runLarkCli.mockReset();
  runLarkCli.mockResolvedValue('ok');
});

describe('getTools', () => {
  it('returns the 5 tools in stable order (lark trio → schedule → memory)', () => {
    const names = getTools().map((t) => t.function.name);
    expect(names).toEqual(['read_skill', 'schema', 'run_lark_cli', 'manage_schedule', 'memory']);
  });

  it('returns the same 5 names regardless of order when sorted', () => {
    const names = getTools().map((t) => t.function.name);
    expect(names.sort()).toEqual([
      'manage_schedule',
      'memory',
      'read_skill',
      'run_lark_cli',
      'schema'
    ]);
  });

  it('feishuLinked=false drops the 3 lark-cli tools, keeps schedule + memory', () => {
    const names = getTools(false).map((t) => t.function.name);
    expect(names).toEqual(['manage_schedule', 'memory']);
  });
});

describe('registry dispatch', () => {
  const ctx = { profile: 'prof1', appId: 'cli_x' } as any;

  it('unknown tool returns "Unknown tool: <name>"', async () => {
    const out = await executeTool('no_such_tool', {}, ctx);
    expect(out).toBe('Unknown tool: no_such_tool');
  });

  it('run_lark_cli with --as user short-circuits when the agent has no user identity', async () => {
    const out = await executeTool(
      'run_lark_cli',
      { argv: ['calendar', '+agenda', '--as', 'user'] },
      { ...ctx, asUser: false }
    );
    expect(out).toContain('[需要用户授权]');
    expect(runLarkCli).not.toHaveBeenCalled();
  });

  it('run_lark_cli with --as bot runs normally (no identity gate)', async () => {
    const out = await executeTool(
      'run_lark_cli',
      { argv: ['im', '+send', '--as', 'bot'] },
      { ...ctx, asUser: false }
    );
    expect(out).toBe('ok');
    expect(runLarkCli).toHaveBeenCalledWith(['im', '+send', '--as', 'bot'], expect.anything());
  });

  it('memory is not gated behind user identity (runs with asUser=false)', async () => {
    listMemoryFacts.mockResolvedValue([]);
    const out = await executeTool('memory', { action: 'list' }, {
      agentId: 'a1',
      ownerId: 'o1',
      asUser: false
    } as any);
    expect(out).toBe('（暂无记忆）');
    expect(listMemoryFacts).toHaveBeenCalled();
  });
});

describe('larkCliRequiresUser (run_lark_cli identity sniff)', () => {
  it('run_lark_cli with --as user requires user identity', () => {
    expect(larkCliRequiresUser({ argv: ['calendar', '+agenda', '--as', 'user'] })).toBe(true);
  });
  it('run_lark_cli with --as bot does not', () => {
    expect(larkCliRequiresUser({ argv: ['im', '+send', '--as', 'bot'] })).toBe(false);
  });
  it('run_lark_cli with --as=user (equals form) requires user identity', () => {
    expect(larkCliRequiresUser({ argv: ['calendar', '+agenda', '--as=user'] })).toBe(true);
  });
  it('tracks the LAST --as (bot then user → true)', () => {
    expect(larkCliRequiresUser({ argv: ['--as', 'bot', '--as', 'user'] })).toBe(true);
  });
  it('tracks the LAST --as (user then bot → false)', () => {
    expect(larkCliRequiresUser({ argv: ['--as', 'user', '--as', 'bot'] })).toBe(false);
  });
  it('run_lark_cli with --as=bot (equals form) does not', () => {
    expect(larkCliRequiresUser({ argv: ['im', '+send', '--as=bot'] })).toBe(false);
  });
  it('no --as at all does not require user identity', () => {
    expect(larkCliRequiresUser({ argv: ['drive', '+ls'] })).toBe(false);
  });
});

describe('read_skill dispatch', () => {
  const ctx = { profile: 'prof1', appId: 'cli_x' } as any;

  it('forwards args.path to readSkill so the agent can fetch a reference file', async () => {
    await executeTool(
      'read_skill',
      { domain: 'lark-base', path: 'references/formula-field-guide.md' },
      ctx
    );
    expect(readSkill).toHaveBeenCalledWith(
      'lark-base',
      ctx,
      undefined,
      'references/formula-field-guide.md'
    );
  });

  it('calls readSkill without a path when none is given', async () => {
    await executeTool('read_skill', { domain: 'lark-calendar' }, ctx);
    expect(readSkill).toHaveBeenCalledWith('lark-calendar', ctx, undefined, undefined);
  });
});

describe('memory tool', () => {
  const ctx = { agentId: 'a1', ownerId: 'o1' } as any;

  it('save calls saveMemoryFact with ctx ids and formats ok', async () => {
    saveMemoryFact.mockResolvedValue({ ok: true });
    const out = await executeTool(
      'memory',
      { action: 'save', key: 'k', value: 'v', label: 'L' },
      ctx
    );
    expect(saveMemoryFact).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'a1', ownerId: 'o1', key: 'k', value: 'v', label: 'L' })
    );
    expect(out).toContain('✅ 已记住 L');
  });

  it('save without a key returns an error without calling saveMemoryFact', async () => {
    const out = await executeTool('memory', { action: 'save', value: 'v' }, ctx);
    expect(out).toBe('[memory] save requires "key"');
    expect(saveMemoryFact).not.toHaveBeenCalled();
  });

  it('save surfaces a too-long value error from saveMemoryFact', async () => {
    saveMemoryFact.mockResolvedValue({ ok: false, error: 'value too long (max 4096 chars)' });
    const out = await executeTool(
      'memory',
      { action: 'save', key: 'k', value: 'x'.repeat(4097) },
      ctx
    );
    expect(out).toBe('[memory] value too long (max 4096 chars)');
  });

  it('get hit returns "label: value"', async () => {
    getMemoryFact.mockResolvedValue({ key: 'k', value: 'v', label: 'L' });
    const out = await executeTool('memory', { action: 'get', key: 'k' }, ctx);
    expect(out).toBe('L: v');
  });

  it('get miss returns 未找到', async () => {
    getMemoryFact.mockResolvedValue(null);
    const out = await executeTool('memory', { action: 'get', key: 'k' }, ctx);
    expect(out).toContain('未找到');
  });

  it('delete true returns ✅', async () => {
    deleteMemoryFact.mockResolvedValue(true);
    const out = await executeTool('memory', { action: 'delete', key: 'k' }, ctx);
    expect(out).toContain('✅ 已删除 k');
  });

  it('delete false returns 未找到', async () => {
    deleteMemoryFact.mockResolvedValue(false);
    const out = await executeTool('memory', { action: 'delete', key: 'k' }, ctx);
    expect(out).toContain('未找到');
  });

  it('list shows the real key (not just the label) so delete can target it', async () => {
    listMemoryFacts.mockResolvedValue([
      {
        key: 'car.camping_mode',
        value: 'off',
        label: '车辆露营模式状态',
        category: 'status'
      } as any
    ]);
    const out = await executeTool('memory', { action: 'list' }, ctx);
    expect(out).toContain('car.camping_mode');
    expect(out).toContain('车辆露营模式状态');
    expect(out).toContain('[status]');
  });

  it('missing agentId returns the context error', async () => {
    const out = await executeTool('memory', { action: 'list' }, {} as any);
    expect(out).toContain('[memory] missing agent context');
  });
});
