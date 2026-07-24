import { describe, it, expect, vi } from 'vitest';

vi.mock('./retry-queue', () => ({
  claimPendingRetry: vi.fn().mockResolvedValue({
    id: 'r1',
    agentId: 'a1',
    ownerId: 'o1',
    chatId: 'c1',
    chatType: 'p2p',
    failedArgv: ['calendar', '+agenda', '--as', 'user'],
    pendingScopes: ['calendar:calendar.event:read']
  }),
  markRetry: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./proactive-runner', () => ({
  runProactiveTurn: vi
    .fn()
    .mockResolvedValue({ finalContent: 'ok', stopReason: 'final', toolCallLog: [] })
}));

import { replayPending } from './auth-replay';
import { claimPendingRetry, markRetry } from './retry-queue';
import { runProactiveTurn } from './proactive-runner';

describe('replayPending', () => {
  it('claims the retry, runs a proactive turn, marks done', async () => {
    const sendFn = vi.fn();
    await replayPending('a1', sendFn);
    expect(claimPendingRetry).toHaveBeenCalledWith('a1');
    expect(runProactiveTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'a1',
        chatId: 'c1',
        ownerId: 'o1',
        // The failed-argv hint must reach the synthetic userMessage so the
        // LLM is told exactly which command to retry after the scope grant.
        userMessage: expect.stringContaining('calendar')
      })
    );
    expect(markRetry).toHaveBeenCalledWith('r1', 'done');
  });

  it('marks failed when runProactiveTurn throws', async () => {
    vi.mocked(runProactiveTurn).mockRejectedValueOnce(new Error('boom'));
    await replayPending('a1', vi.fn());
    expect(markRetry).toHaveBeenCalledWith('r1', 'failed');
  });

  it('does nothing (no mark) when there is no pending retry', async () => {
    vi.mocked(claimPendingRetry).mockResolvedValueOnce(null);
    const before = vi.mocked(markRetry).mock.calls.length;
    await replayPending('a1', vi.fn());
    expect(vi.mocked(markRetry).mock.calls.length).toBe(before);
  });
});
