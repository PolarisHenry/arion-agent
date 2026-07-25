import { describe, it, expect } from 'vitest';
import { config } from '../config';
import { resolveLoopPolicy } from './agent-policy';

describe('resolveLoopPolicy', () => {
  it('uses the explicit loopMaxTokens when set (overrides the global default)', () => {
    const policy = resolveLoopPolicy({ loopMaxTokens: 123_456 });
    expect(policy.maxTokens).toBe(123_456);
  });

  it('falls back to the global default when no explicit override', () => {
    const policy = resolveLoopPolicy({ loopMaxTokens: null });
    expect(policy.maxTokens).toBe(config.agentLoop.maxTokens);
  });

  it('inherits wall-clock + rounds + stuck guards from the global policy', () => {
    const policy = resolveLoopPolicy({ loopMaxTokens: 1 });
    expect(policy.maxWallMs).toBe(config.agentLoop.maxWallMs);
    expect(policy.maxRounds).toBe(config.agentLoop.maxRounds);
    expect(policy.maxRepeats).toBe(config.agentLoop.maxRepeats);
    expect(policy.maxConsecutiveErrors).toBe(config.agentLoop.maxConsecutiveErrors);
  });
});
