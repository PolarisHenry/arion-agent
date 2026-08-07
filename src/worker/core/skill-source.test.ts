import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted so the inner chain mocks exist at vi.mock hoist time. Exposes
// `.values` / `.returning` so DB-op tests can assert payload + control update
// hit/miss without relying on chain-indexing bugs.
const dbMocks = vi.hoisted(() => ({
  // payload arg typed so .mock.calls[0][0] is indexable for assertion
  values: vi.fn((_payload: any) => ({ onConflictDoUpdate: vi.fn(async () => undefined) })),
  returning: vi.fn(async () => [] as { id: string }[])
}));

vi.mock('../worker-db', () => ({
  workerDb: {
    insert: vi.fn(() => ({ values: dbMocks.values })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: dbMocks.returning })) }))
    })),
    select: vi.fn(() => {
      throw new Error('select not stubbed for this test');
    })
  },
  agentSchema: { agentSkill: { id: 'id', agentId: 'agent_id', name: 'name' } }
}));

import { workerDb } from '../worker-db';
import {
  buildSkillIndex,
  filterByPlatform,
  mergeSkills,
  registerSkillSource,
  resetSkillSources,
  listSkillsForAgent,
  findSkillForAgent,
  loadSkillIndex,
  saveAgentSkill,
  updateAgentSkill,
  isValidSkillName,
  DbSkillSource,
  type ArionSkill,
  type SkillSource
} from './skill-source';

const mk = (over: Partial<ArionSkill> = {}): ArionSkill => ({
  name: 'x',
  description: 'd',
  body: 'b',
  scope: 'agent',
  provenance: 'manual',
  enabled: true,
  ...over
});

describe('buildSkillIndex', () => {
  it('empty → ""', () => {
    expect(buildSkillIndex([])).toBe('');
  });
  it('renders each skill as `- name: desc` under a 技能 header', () => {
    const out = buildSkillIndex([mk({ name: 'a', description: '做 A' })]);
    expect(out).toContain('## 技能');
    expect(out).toContain('`a`: 做 A');
  });
});

describe('filterByPlatform', () => {
  it('keeps skills with no platform gate', () => {
    expect(filterByPlatform([mk({ platforms: undefined })], 'wechat')).toHaveLength(1);
  });
  it('drops skills gated to the other platform', () => {
    expect(filterByPlatform([mk({ platforms: ['lark'] })], 'wechat')).toHaveLength(0);
  });
  it('keeps skills whose gate includes the platform', () => {
    expect(filterByPlatform([mk({ platforms: ['lark', 'wechat'] })], 'wechat')).toHaveLength(1);
  });
});

describe('mergeSkills', () => {
  it('dedupes by name, earlier source wins', () => {
    const a = [mk({ name: 'x', description: 'from-a' })];
    const b = [mk({ name: 'x', description: 'from-b' })];
    const merged = mergeSkills([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].description).toBe('from-a');
  });
});

describe('registry', () => {
  beforeEach(() => resetSkillSources());

  it('listSkillsForAgent merges registered sources (earlier wins on clash)', async () => {
    const fakeA: SkillSource = {
      id: 'fake-a',
      listForAgent: async () => [mk({ name: 'shared', description: 'from-a' })]
    };
    const fakeB: SkillSource = {
      id: 'fake-b',
      listForAgent: async () => [
        mk({ name: 'shared', description: 'from-b should lose' }),
        mk({ name: 'only-in-b' })
      ]
    };
    registerSkillSource(fakeA);
    registerSkillSource(fakeB);
    const all = await listSkillsForAgent('a1', 'o1');
    // fakeA registered first → wins on the colliding name; both uniques visible
    const shared = all.find((s) => s.name === 'shared')!;
    expect(shared.description).toBe('from-a');
    expect(all.some((s) => s.name === 'only-in-b')).toBe(true);
  });

  it('findSkillForAgent resolves by name', async () => {
    registerSkillSource({
      id: 'fake',
      listForAgent: async () => [mk({ name: 'weekly-report', body: '# 发周报' })]
    });
    const s = await findSkillForAgent('a1', 'o1', 'weekly-report');
    expect(s?.body).toContain('# 发周报');
  });

  it('loadSkillIndex renders enabled, platform-gated skills', async () => {
    registerSkillSource({
      id: 'fake',
      listForAgent: async () => [
        mk({ name: 'weekly-report' }), // no gate → visible on wechat
        mk({ name: 'lark-only-thing', platforms: ['lark'] }) // gated lark → hidden on wechat
      ]
    });
    const idx = await loadSkillIndex('a1', 'o1', 'wechat');
    expect(idx).toContain('weekly-report');
    expect(idx).not.toContain('lark-only-thing');
  });
});

describe('DB ops', () => {
  beforeEach(() => {
    dbMocks.values.mockClear();
    dbMocks.returning.mockClear();
    vi.mocked(workerDb.insert).mockClear();
    vi.mocked(workerDb.update).mockClear();
  });

  it('isValidSkillName accepts snake/kebab, rejects chinese/space', () => {
    expect(isValidSkillName('weekly_report')).toBe(true);
    expect(isValidSkillName('weekly-report')).toBe(true);
    expect(isValidSkillName('周报')).toBe(false);
    expect(isValidSkillName('weekly report')).toBe(false);
  });

  it('saveAgentSkill rejects bad name without touching DB', async () => {
    const r = await saveAgentSkill({
      agentId: 'a1',
      ownerId: 'o1',
      name: '周报',
      description: 'd',
      body: 'b'
    });
    expect(r.ok).toBe(false);
    expect(workerDb.insert).not.toHaveBeenCalled();
  });

  it('saveAgentSkill rejects empty description/body without touching DB', async () => {
    const r = await saveAgentSkill({
      agentId: 'a1',
      ownerId: 'o1',
      name: 'ok',
      description: '',
      body: 'b'
    });
    expect(r.ok).toBe(false);
    expect(workerDb.insert).not.toHaveBeenCalled();
  });

  it('saveAgentSkill ok path calls insert with agentId/ownerId/scope=agent', async () => {
    const r = await saveAgentSkill({
      agentId: 'a1',
      ownerId: 'o1',
      name: 'weekly',
      description: 'd',
      body: 'b',
      provenance: 'precipitated'
    });
    expect(r.ok).toBe(true);
    expect(workerDb.insert).toHaveBeenCalledTimes(1);
    // payload is the arg to the inner .values(...)
    expect(dbMocks.values.mock.calls[0][0]).toMatchObject({
      agentId: 'a1',
      ownerId: 'o1',
      name: 'weekly',
      scope: 'agent',
      provenance: 'precipitated',
      enabled: true
    });
  });

  it('updateAgentSkill ok path calls update and returns ok:true', async () => {
    dbMocks.returning.mockResolvedValueOnce([{ id: 'row1' }]);
    const r = await updateAgentSkill('a1', 'weekly', { description: 'd2' });
    expect(r.ok).toBe(true);
    expect(workerDb.update).toHaveBeenCalledTimes(1);
  });

  it('updateAgentSkill miss returns ok:false', async () => {
    // default dbMocks.returning resolves to [] → no row matched
    const r = await updateAgentSkill('a1', 'nope', { description: 'd2' });
    expect(r.ok).toBe(false);
    expect(workerDb.update).toHaveBeenCalledTimes(1);
  });

  it('DbSkillSource.listForAgent returns [] on db error (fault-tolerant)', async () => {
    vi.mocked(workerDb.select).mockImplementationOnce((() => {
      throw new Error('boom');
    }) as any);
    const src = new DbSkillSource();
    const list = await src.listForAgent('a1', 'o1');
    expect(list).toEqual([]);
  });
});
