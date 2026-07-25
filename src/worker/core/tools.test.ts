import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./agent-memory', () => ({
  saveMemoryFact: vi.fn(),
  getMemoryFact: vi.fn(),
  listMemoryFacts: vi.fn(),
  deleteMemoryFact: vi.fn(),
  loadMemoryFacts: vi.fn(),
  renderMemorySection: vi.fn(() => '')
}));

import { getTools, isUserRequired, executeTool } from './tools';
import { saveMemoryFact, getMemoryFact, listMemoryFacts, deleteMemoryFact } from './agent-memory';

beforeEach(() => {
  saveMemoryFact.mockReset();
  getMemoryFact.mockReset();
  listMemoryFacts.mockReset();
  deleteMemoryFact.mockReset();
});

describe('getTools', () => {
  it('returns the 3 generic tools + manage_schedule + memory', () => {
    const names = getTools().map((t) => t.function.name);
    expect(names.sort()).toEqual([
      'manage_schedule',
      'memory',
      'read_skill',
      'run_lark_cli',
      'schema'
    ]);
  });
});

describe('isUserRequired', () => {
  it('memory never requires user identity', () => {
    expect(isUserRequired('memory', { action: 'save' })).toBe(false);
  });

  it('run_lark_cli with --as user requires user identity', () => {
    expect(isUserRequired('run_lark_cli', { argv: ['calendar', '+agenda', '--as', 'user'] })).toBe(
      true
    );
  });
  it('run_lark_cli with --as bot does not', () => {
    expect(isUserRequired('run_lark_cli', { argv: ['im', '+send', '--as', 'bot'] })).toBe(false);
  });
  it('run_lark_cli with --as=user (equals form) requires user identity', () => {
    expect(isUserRequired('run_lark_cli', { argv: ['calendar', '+agenda', '--as=user'] })).toBe(
      true
    );
  });
  it('run_lark_cli tracks the LAST --as (bot then user → true)', () => {
    expect(isUserRequired('run_lark_cli', { argv: ['--as', 'bot', '--as', 'user'] })).toBe(true);
  });
  it('run_lark_cli tracks the LAST --as (user then bot → false)', () => {
    expect(isUserRequired('run_lark_cli', { argv: ['--as', 'user', '--as', 'bot'] })).toBe(false);
  });
  it('run_lark_cli with --as=bot (equals form) does not', () => {
    expect(isUserRequired('run_lark_cli', { argv: ['im', '+send', '--as=bot'] })).toBe(false);
  });
  it('read_skill / schema never require user identity', () => {
    expect(isUserRequired('read_skill', { domain: 'lark-calendar' })).toBe(false);
    expect(isUserRequired('schema', { method: 'x.y.z' })).toBe(false);
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

  it('missing agentId returns the context error', async () => {
    const out = await executeTool('memory', { action: 'list' }, {} as any);
    expect(out).toContain('[memory] missing agent context');
  });
});
