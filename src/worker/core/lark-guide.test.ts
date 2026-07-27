import { describe, it, expect, vi } from 'vitest';
import { parseSkillsList, USAGE_RULES } from './lark-guide';

const SKILLS_FIXTURE = JSON.stringify({
  ok: true,
  skills: [
    { name: 'lark-calendar', description: 'Calendar management', version: '1.0.0' },
    { name: 'lark-doc', description: 'Doc operations', version: '1.0.0' },
    { name: 'lark-shared', description: 'Auth/setup', version: '1.0.0' }
  ]
});

describe('parseSkillsList', () => {
  it('extracts just the skill names from the { skills: [] } envelope', () => {
    const skills = parseSkillsList(SKILLS_FIXTURE);
    expect(skills).toEqual([
      { name: 'lark-calendar' },
      { name: 'lark-doc' },
      { name: 'lark-shared' }
    ]);
  });

  it('also accepts a bare array payload', () => {
    const skills = parseSkillsList(JSON.stringify([{ name: 'lark-x', description: 'd' }]));
    expect(skills).toEqual([{ name: 'lark-x' }]);
  });

  it('drops entries without a name and returns [] on non-JSON / missing skills', () => {
    expect(parseSkillsList('not json')).toEqual([]);
    expect(parseSkillsList(JSON.stringify({ ok: true }))).toEqual([]);
    expect(parseSkillsList(JSON.stringify({ skills: [{ description: 'no name' }] }))).toEqual([]);
  });
});

describe('buildLarkGuide', () => {
  it('includes the skill-name index and the usage rules, memoized by version', async () => {
    // cachedGuide persists across tests in this file — reset modules + dynamic
    // import so this test starts with an empty cache.
    vi.resetModules();
    const { buildLarkGuide } = await import('./lark-guide');
    let calls = 0;
    const fakeExec = async (_f: string, args: string[]) => {
      calls++;
      if (args.includes('--version')) return { stdout: 'lark-cli version 1.0.72\n', stderr: '' };
      return { stdout: SKILLS_FIXTURE, stderr: '' };
    };
    const first = await buildLarkGuide(fakeExec);
    const second = await buildLarkGuide(fakeExec);
    expect(first).toContain('lark-calendar');
    // lark-shared is not a CLI domain — the old --help index hid it; the new
    // skills-list index must surface it so the agent knows it can read it.
    expect(first).toContain('lark-shared');
    expect(first).toContain(USAGE_RULES.slice(0, 20));
    expect(calls).toBe(2); // version + skills list, once — memoized on second call
    expect(second).toBe(first);
  });

  it('resolves (never rejects) with a rules-only fallback when introspection throws', async () => {
    vi.resetModules();
    const { buildLarkGuide } = await import('./lark-guide');
    const throwingExec = async () => {
      throw new Error('ENOENT: lark-cli binary not found');
    };
    const guide = await buildLarkGuide(throwingExec as any);
    expect(typeof guide).toBe('string');
    expect(guide).toContain(USAGE_RULES.slice(0, 20));
  });
});
