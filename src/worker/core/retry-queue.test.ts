import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../worker-db', () => {
  const insert = vi.fn();
  const select = vi.fn();
  const update = vi.fn();
  return {
    workerDb: { insert, select, update },
    agentSchema: {
      agentRetryQueue: { id: 'id', agentId: 'agent_id', status: 'status', createdAt: 'created_at' }
    }
  };
});

import { enqueueRetry, claimPendingRetry, markRetry } from './retry-queue';
import { workerDb } from '../worker-db';

beforeEach(() => {
  (workerDb.insert as any).mockReset();
  (workerDb.select as any).mockReset();
  (workerDb.update as any).mockReset();
});

describe('retry-queue', () => {
  it('enqueueRetry inserts a pending row with failedArgv + pendingScopes and returns an id', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    (workerDb.insert as any).mockReturnValue({ values });

    const id = await enqueueRetry({
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      chatType: 'p2p',
      failedArgv: ['calendar', '+agenda', '--as', 'user'],
      pendingScopes: ['calendar:calendar.event:read']
    });

    expect(id).toEqual(expect.any(String));
    expect(workerDb.insert as any).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id',
        agentId: 'agent_id',
        status: 'status',
        createdAt: 'created_at'
      })
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        failedArgv: ['calendar', '+agenda', '--as', 'user'],
        pendingScopes: ['calendar:calendar.event:read'],
        ownerId: 'o1',
        agentId: 'a1',
        chatId: 'c1',
        chatType: 'p2p'
      })
    );
  });

  it('claimPendingRetry returns null when no rows', async () => {
    (workerDb.update as any).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) })
      })
    });
    expect(await claimPendingRetry('a1')).toBeNull();
  });

  it('claimPendingRetry returns the oldest row and re-marks extras back to pending', async () => {
    const older = {
      id: 'r-old',
      agentId: 'a1',
      status: 'running',
      createdAt: new Date('2026-07-23T10:00:00Z'),
      ownerId: 'o1',
      chatId: null,
      chatType: null,
      failedArgv: ['x'],
      pendingScopes: ['s']
    };
    const newer = {
      id: 'r-new',
      agentId: 'a1',
      status: 'running',
      createdAt: new Date('2026-07-23T11:00:00Z'),
      ownerId: 'o1',
      chatId: null,
      chatType: null,
      failedArgv: ['y'],
      pendingScopes: ['s']
    };

    // First update chain (claim) returns both rows out of order; later chains (re-mark) return [].
    const setCalls: { setStatus: any }[] = [];
    let chainCount = 0;
    (workerDb.update as any).mockImplementation(() => {
      chainCount++;
      const current = chainCount;
      const returning = vi.fn().mockResolvedValue(current === 1 ? [newer, older] : []);
      const where = vi.fn().mockReturnValue({ returning });
      const set = vi.fn().mockImplementation((v: any) => {
        setCalls.push({ setStatus: v });
        return { where };
      });
      return { set };
    });

    const result = await claimPendingRetry('a1');

    // Returns the OLDEST row only.
    expect(result).toEqual(expect.objectContaining({ id: 'r-old' }));
    // Two update chains: 1 claim + 1 re-mark for the extra.
    expect(workerDb.update as any).toHaveBeenCalledTimes(2);
    // First .set flipped the claimed row to running.
    expect(setCalls[0].setStatus).toEqual({ status: 'running' });
    // Second .set re-marked the extra back to pending.
    expect(setCalls[1].setStatus).toEqual({ status: 'pending' });
  });

  it('markRetry updates status to done targeting the passed id', async () => {
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined)
    });
    (workerDb.update as any).mockReturnValue({ set: setSpy });

    await expect(markRetry('r1', 'done')).resolves.toBeUndefined();

    expect(setSpy).toHaveBeenCalledWith({ status: 'done' });
    expect(workerDb.update as any).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id',
        agentId: 'agent_id',
        status: 'status',
        createdAt: 'created_at'
      })
    );
  });

  it('markRetry updates status to failed', async () => {
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined)
    });
    (workerDb.update as any).mockReturnValue({ set: setSpy });

    await markRetry('r2', 'failed');

    expect(setSpy).toHaveBeenCalledWith({ status: 'failed' });
  });
});
