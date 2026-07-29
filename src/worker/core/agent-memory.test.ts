import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderMemorySection, type MemoryFact } from './agent-memory';

const fact = (over: Partial<MemoryFact> = {}): MemoryFact => ({
  id: over.id ?? 'm1',
  key: over.key ?? 'accounting.spreadsheet_token',
  value: over.value ?? 'UXgbsmXpdhE26FtWhMWc95uDnKd',
  label: over.label ?? '记账表格 token',
  category: over.category ?? 'resource',
  note: over.note ?? null,
  importance: over.importance ?? 'medium',
  expiresAt: over.expiresAt ?? null,
  updatedAt: over.updatedAt ?? new Date('2026-07-25T10:00:00Z')
});

// -----------------------------------------------------------
// Pure renderMemorySection tests — no DB mocking
// -----------------------------------------------------------

describe('renderMemorySection', () => {
  it('returns empty string when there are no facts', () => {
    expect(renderMemorySection([])).toBe('');
  });

  it('renders header + one fact (label: value)', () => {
    const out = renderMemorySection([fact()]);
    expect(out).toContain('已记下的信息');
    expect(out).toContain('记账表格 token: UXgbsmXpdhE26FtWhMWc95uDnKd');
  });

  it('prefixes category and appends note', () => {
    const out = renderMemorySection([fact({ note: '记账明细 2026' })]);
    expect(out).toContain('[resource]');
    expect(out).toContain('（记账明细 2026）');
  });

  it('falls back to key when label is null', () => {
    const out = renderMemorySection([{ ...fact(), label: null, key: 'k1', category: null }]);
    expect(out).toContain('- k1:');
  });

  it('sorts high before medium before low, then newest-first within tier', () => {
    const out = renderMemorySection([
      fact({ value: 'low', importance: 'low', updatedAt: new Date('2026-07-25T00:00:00Z') }),
      fact({ value: 'med', importance: 'medium', updatedAt: new Date('2026-07-01T00:00:00Z') }),
      fact({ value: 'hi', importance: 'high', updatedAt: new Date('2026-07-01T00:00:00Z') })
    ]);
    expect(out.indexOf('hi')).toBeLessThan(out.indexOf('med'));
    expect(out.indexOf('med')).toBeLessThan(out.indexOf('low'));
  });

  it('excludes expired facts', () => {
    const out = renderMemorySection([
      fact({ value: 'alive', expiresAt: new Date('2099-01-01T00:00:00Z') }),
      fact({ value: 'dead', expiresAt: new Date('2020-01-01T00:00:00Z') })
    ]);
    expect(out).toContain('alive');
    expect(out).not.toContain('dead');
  });

  it('truncates values longer than 80 chars', () => {
    const long = 'x'.repeat(200);
    const out = renderMemorySection([fact({ value: long })]);
    expect(out).toContain('…');
    expect(out).not.toContain('x'.repeat(200));
  });

  it('caps at 200 facts and appends the "更多" hint', () => {
    const many = Array.from({ length: 220 }, (_, i) =>
      fact({
        id: `m${i}`,
        key: `k${i}`,
        label: null,
        category: null,
        updatedAt: new Date(2026, 6, 1, 0, i)
      })
    );
    const out = renderMemorySection(many);
    expect(out).toContain('更多请用 memory list 查看');
    const factLines = out.split('\n').filter((l) => l.startsWith('- ')).length;
    expect(factLines).toBeLessThanOrEqual(200);
  });
});

// -----------------------------------------------------------
// DB op tests — mocked workerDb
// -----------------------------------------------------------

vi.mock('../worker-db', () => {
  const chain = () => {
    const self: any = {
      from: vi.fn(() => self),
      where: vi.fn(() => self),
      values: vi.fn(() => self),
      set: vi.fn(() => self),
      limit: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockResolvedValue([]),
      returning: vi.fn().mockResolvedValue([]),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined)
    };
    return self;
  };
  return {
    workerDb: {
      insert: vi.fn(() => chain()),
      select: vi.fn(() => chain()),
      update: vi.fn(() => chain()),
      delete: vi.fn(() => chain())
    },
    agentSchema: {
      agentMemory: {
        id: 'id',
        agentId: 'agent_id',
        ownerId: 'owner_id',
        key: 'key',
        value: 'value',
        label: 'label',
        category: 'category',
        note: 'note',
        importance: 'importance',
        expiresAt: 'expires_at',
        updatedAt: 'updated_at'
      }
    }
  };
});

import { workerDb } from '../worker-db';
import { saveMemoryFact, getMemoryFact, deleteMemoryFact, loadMemoryFacts } from './agent-memory';

beforeEach(() => {
  (workerDb.insert as any).mockClear();
  (workerDb.select as any).mockClear();
  (workerDb.delete as any).mockClear();
});

describe('saveMemoryFact', () => {
  it('rejects an empty key without touching the DB', async () => {
    const res = await saveMemoryFact({ agentId: 'a1', ownerId: 'o1', key: '  ', value: 'v' });
    expect(res).toEqual({ ok: false, error: 'key is required' });
    expect(workerDb.insert as any).not.toHaveBeenCalled();
  });

  it('rejects an empty value', async () => {
    const res = await saveMemoryFact({ agentId: 'a1', ownerId: 'o1', key: 'k', value: '' });
    expect(res).toEqual({ ok: false, error: 'value is required' });
  });

  it('rejects a value over 4096 chars', async () => {
    const res = await saveMemoryFact({
      agentId: 'a1',
      ownerId: 'o1',
      key: 'k',
      value: 'x'.repeat(4097)
    });
    expect(res.ok).toBe(false);
    expect((res as any).error).toContain('4096');
    expect(workerDb.insert as any).not.toHaveBeenCalled();
  });

  it('rejects invalid importance', async () => {
    const res = await saveMemoryFact({
      agentId: 'a1',
      ownerId: 'o1',
      key: 'k',
      value: 'v',
      importance: 'critical'
    });
    expect(res.ok).toBe(false);
    expect((res as any).error).toContain('importance');
  });

  it('rejects invalid expiresAt', async () => {
    const res = await saveMemoryFact({
      agentId: 'a1',
      ownerId: 'o1',
      key: 'k',
      value: 'v',
      expiresAt: 'not-a-date'
    });
    expect(res.ok).toBe(false);
    expect((res as any).error).toContain('expiresAt');
  });

  it('upserts on valid input (insert + onConflictDoUpdate)', async () => {
    const res = await saveMemoryFact({
      agentId: 'a1',
      ownerId: 'o1',
      key: 'k',
      value: 'v',
      label: 'L',
      importance: 'high'
    });
    expect(res).toEqual({ ok: true });
    expect(workerDb.insert as any).toHaveBeenCalled();
  });
});

describe('getMemoryFact', () => {
  it('returns null when nothing matches', async () => {
    expect(await getMemoryFact('a1', 'missing')).toBeNull();
  });
});

describe('deleteMemoryFact', () => {
  it('returns false when no row was deleted (returning [])', async () => {
    expect(await deleteMemoryFact('a1', 'k')).toBe(false);
  });

  it('returns true when a row was deleted', async () => {
    (workerDb.delete as any).mockReturnValueOnce({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 'm1' }]) }))
    });
    expect(await deleteMemoryFact('a1', 'k')).toBe(true);
  });
});

describe('loadMemoryFacts', () => {
  it('returns an empty array by default', async () => {
    expect(await loadMemoryFacts('a1')).toEqual([]);
  });
});
