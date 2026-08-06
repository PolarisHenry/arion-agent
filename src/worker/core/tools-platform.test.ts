import { describe, it, expect } from 'vitest';
import { getTools } from './tools';

const names = (feishuLinked: boolean) => getTools(feishuLinked).map((t) => t.function.name);

describe('getTools(feishuLinked)', () => {
  it('feishu-linked includes every tool (lark-cli + manage_schedule + memory)', () => {
    expect(names(true)).toEqual(
      expect.arrayContaining(['run_lark_cli', 'read_skill', 'schema', 'manage_schedule', 'memory'])
    );
  });

  it('default (no arg) is feishu-linked — backward compatible', () => {
    expect(getTools().map((t) => t.function.name)).toEqual(names(true));
  });

  it('not feishu-linked excludes the lark-cli tools', () => {
    const n = names(false);
    expect(n).not.toContain('run_lark_cli');
    expect(n).not.toContain('read_skill');
    expect(n).not.toContain('schema');
  });

  it('not feishu-linked keeps the platform-agnostic tools', () => {
    const n = names(false);
    expect(n).toContain('memory');
    expect(n).toContain('manage_schedule');
  });
});
