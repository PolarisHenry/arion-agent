import { describe, it, expect } from 'vitest';
import { getTools, isUserRequired } from './tools';

describe('getTools', () => {
  it('returns exactly the 3 generic tools + manage_schedule', () => {
    const tools = getTools();
    const names = tools.map((t) => t.function.name);
    expect(names.sort()).toEqual(['manage_schedule', 'read_skill', 'run_lark_cli', 'schema']);
  });
});

describe('isUserRequired', () => {
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
