import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./skill-source', () => ({
  findSkillForAgent: vi.fn(),
  saveAgentSkill: vi.fn(),
  updateAgentSkill: vi.fn()
}));

import { executeTool } from './tools';
import { findSkillForAgent, saveAgentSkill, updateAgentSkill } from './skill-source';

beforeEach(() => {
  findSkillForAgent.mockReset();
  saveAgentSkill.mockReset();
  updateAgentSkill.mockReset();
});

describe('skill tool — load', () => {
  const ctx = { agentId: 'a1', ownerId: 'o1' } as any;

  it('load hit returns the skill body', async () => {
    findSkillForAgent.mockResolvedValue({
      name: 'weekly-report',
      description: 'd',
      body: '# 发周报\n步骤…',
      scope: 'platform',
      provenance: 'builtin',
      enabled: true
    });
    const out = await executeTool('skill', { action: 'load', name: 'weekly-report' }, ctx);
    expect(out).toContain('# 发周报');
    expect(findSkillForAgent).toHaveBeenCalledWith('a1', 'o1', 'weekly-report');
  });

  it('load miss returns 未找到 with the naming hint', async () => {
    findSkillForAgent.mockResolvedValue(undefined);
    const out = await executeTool('skill', { action: 'load', name: 'nope' }, ctx);
    expect(out).toContain('未找到');
    expect(out).toContain('read_skill');
  });

  it('missing agentId returns the context error', async () => {
    const out = await executeTool('skill', { action: 'load', name: 'x' }, {} as any);
    expect(out).toContain('[skill] missing agent context');
  });

  it('unknown action returns a hint', async () => {
    const out = await executeTool('skill', { action: 'frobnicate', name: 'x' }, ctx);
    expect(out).toContain('unknown action');
  });
});

describe('skill tool — create / update', () => {
  const ctx = { agentId: 'a1', ownerId: 'o1', chatId: 'c1' } as any;

  it('create ok calls saveAgentSkill with chatId + provenance=precipitated', async () => {
    saveAgentSkill.mockResolvedValue({ ok: true, name: 'weekly' });
    const out = await executeTool(
      'skill',
      { action: 'create', name: 'weekly', description: '发周报', body: '# 步骤' },
      ctx
    );
    expect(saveAgentSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'a1',
        ownerId: 'o1',
        name: 'weekly',
        description: '发周报',
        body: '# 步骤',
        provenance: 'precipitated',
        sourceChatId: 'c1'
      })
    );
    expect(out).toContain('✅');
    expect(out).toContain('请向用户确认');
  });

  it('create without description returns an error, no DB call', async () => {
    const out = await executeTool('skill', { action: 'create', name: 'x', body: 'b' }, ctx);
    expect(out).toContain('[skill] create requires "description"');
    expect(saveAgentSkill).not.toHaveBeenCalled();
  });

  it('create surfaces saveAgentSkill error', async () => {
    saveAgentSkill.mockResolvedValue({ ok: false, error: 'name must be lowercase' });
    const out = await executeTool(
      'skill',
      { action: 'create', name: 'X', description: 'd', body: 'b' },
      ctx
    );
    expect(out).toContain('name must be lowercase');
  });

  it('update ok calls updateAgentSkill with description/body patch', async () => {
    updateAgentSkill.mockResolvedValue({ ok: true });
    const out = await executeTool(
      'skill',
      { action: 'update', name: 'weekly', description: 'd2' },
      ctx
    );
    expect(updateAgentSkill).toHaveBeenCalledWith('a1', 'weekly', {
      description: 'd2',
      body: undefined
    });
    expect(out).toContain('✅');
  });

  it('update miss returns the skill error message', async () => {
    updateAgentSkill.mockResolvedValue({ ok: false, error: '未找到技能 weekly' });
    const out = await executeTool('skill', { action: 'update', name: 'weekly', body: 'b2' }, ctx);
    expect(out).toContain('未找到技能 weekly');
  });
});
