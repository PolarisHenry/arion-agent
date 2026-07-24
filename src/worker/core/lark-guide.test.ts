import { describe, it, expect, vi } from 'vitest';
import { parseDomainsFromHelp, USAGE_RULES } from './lark-guide';

const HELP_FIXTURE = `lark-cli — Lark/Feishu CLI tool.

Usage:
  lark-cli <command> [subcommand] [method] [flags]

Lark domains:
  application Open Platform app self-management: slash commands for the currently bound app
  calendar    Calendar, event, and attendee management
  docs        Document and content operations
  im          Message and group chat management

Agent tooling:
  something else
`;

describe('parseDomainsFromHelp', () => {
  it('extracts the Lark domains block as name + description', () => {
    const domains = parseDomainsFromHelp(HELP_FIXTURE);
    expect(domains.map((d) => d.name)).toEqual(['application', 'calendar', 'docs', 'im']);
    expect(domains[1]).toEqual({
      name: 'calendar',
      description: 'Calendar, event, and attendee management'
    });
  });

  it('stops at the next section (Agent tooling) and ignores other lines', () => {
    const domains = parseDomainsFromHelp(HELP_FIXTURE);
    expect(domains.find((d) => d.name === 'Agent')).toBeUndefined();
  });

  it('returns [] when there is no domains block', () => {
    expect(parseDomainsFromHelp('no domains here')).toEqual([]);
  });
});

describe('buildLarkGuide', () => {
  it('includes the domain index and the usage rules, memoized by version', async () => {
    // cachedGuide persists across tests in this file — reset modules + dynamic
    // import so this test starts with an empty cache.
    vi.resetModules();
    const { buildLarkGuide } = await import('./lark-guide');
    let calls = 0;
    const fakeExec = async (_f: string, args: string[]) => {
      calls++;
      if (args.includes('--version')) return { stdout: 'lark-cli version 1.0.72\n', stderr: '' };
      return { stdout: HELP_FIXTURE, stderr: '' };
    };
    const first = await buildLarkGuide(fakeExec);
    const second = await buildLarkGuide(fakeExec);
    expect(first).toContain('calendar');
    expect(first).toContain(USAGE_RULES.slice(0, 20));
    expect(calls).toBe(2); // version + help, once — memoized on second call
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
