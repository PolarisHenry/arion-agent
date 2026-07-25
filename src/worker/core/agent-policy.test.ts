import { describe, it, expect } from 'vitest';
import { config } from '../config';
import {
  effectiveModelName,
  resolveLoopPolicy,
  ONE_M_SUFFIX,
  LOOP_MAX_TOKENS_1M_TIER
} from './agent-policy';

describe('effectiveModelName', () => {
  it('returns the name unchanged when 1M is not enabled', () => {
    expect(
      effectiveModelName({
        modelName: 'claude-sonnet-4-5',
        enable1mContext: false,
        loopMaxTokens: null
      })
    ).toBe('claude-sonnet-4-5');
  });

  it('returns the name unchanged when enable1mContext is null', () => {
    expect(
      effectiveModelName({ modelName: 'gpt-4o', enable1mContext: null, loopMaxTokens: null })
    ).toBe('gpt-4o');
  });

  it('appends the [1m] suffix when 1M is enabled and the name is untagged', () => {
    expect(
      effectiveModelName({
        modelName: 'claude-sonnet-4-5',
        enable1mContext: true,
        loopMaxTokens: null
      })
    ).toBe(`claude-sonnet-4-5${ONE_M_SUFFIX}`);
  });

  it('does not double-tag a name that already carries the lowercase marker', () => {
    expect(
      effectiveModelName({
        modelName: 'claude-sonnet-4-5[1m]',
        enable1mContext: true,
        loopMaxTokens: null
      })
    ).toBe('claude-sonnet-4-5[1m]');
  });

  it('does not double-tag a name that already carries an uppercase marker (case-insensitive)', () => {
    expect(
      effectiveModelName({
        modelName: 'claude-opus-4-8[1M]',
        enable1mContext: true,
        loopMaxTokens: null
      })
    ).toBe('claude-opus-4-8[1M]');
  });
});

describe('resolveLoopPolicy', () => {
  it('uses the explicit loopMaxTokens when set (overrides everything)', () => {
    const policy = resolveLoopPolicy({
      modelName: 'x',
      enable1mContext: true,
      loopMaxTokens: 123_456
    });
    expect(policy.maxTokens).toBe(123_456);
  });

  it('falls back to the 1M tier when 1M is enabled and no explicit override', () => {
    const policy = resolveLoopPolicy({
      modelName: 'x',
      enable1mContext: true,
      loopMaxTokens: null
    });
    expect(policy.maxTokens).toBe(LOOP_MAX_TOKENS_1M_TIER);
  });

  it('falls back to the global default when 1M is disabled and no explicit override', () => {
    const policy = resolveLoopPolicy({
      modelName: 'x',
      enable1mContext: false,
      loopMaxTokens: null
    });
    expect(policy.maxTokens).toBe(config.agentLoop.maxTokens);
  });

  it('inherits wall-clock + rounds + stuck guards from the global policy', () => {
    const policy = resolveLoopPolicy({ modelName: 'x', enable1mContext: true, loopMaxTokens: 1 });
    expect(policy.maxWallMs).toBe(config.agentLoop.maxWallMs);
    expect(policy.maxRounds).toBe(config.agentLoop.maxRounds);
    expect(policy.maxRepeats).toBe(config.agentLoop.maxRepeats);
    expect(policy.maxConsecutiveErrors).toBe(config.agentLoop.maxConsecutiveErrors);
  });
});
