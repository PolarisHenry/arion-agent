import { describe, it, expect, vi } from 'vitest';

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

// buildLarkGuide shells out to lark-cli; inject a fake so tests never touch the
// real binary. Matches the lark-guide.test.ts convention.
const fakeExec = async (_f: string, args: string[]) => {
  if (args.includes('--version')) return { stdout: 'lark-cli version 1.0.72\n', stderr: '' };
  return { stdout: HELP_FIXTURE, stderr: '' };
};

describe('buildSystemPrompt', () => {
  it('assembles persona + lark guide + current time + tool discipline', async () => {
    vi.resetModules();
    const { buildSystemPrompt } = await import('./agent-prompt');
    const prompt = await buildSystemPrompt('你是测试助手。', undefined, fakeExec as any);
    expect(prompt.startsWith('你是测试助手。')).toBe(true);
    expect(prompt).toContain('Lark 可用域'); // lark guide
    expect(prompt).toContain('当前时间'); // time context
    expect(prompt).toContain('工具使用与任务完成纪律'); // discipline
    // No triggered-run block on the normal (message) path.
    expect(prompt).not.toContain('定时触发');
    expect(prompt).not.toContain('以 bot 身份代发');
  });

  it('appends the triggered-run context when triggeredRun is set', async () => {
    vi.resetModules();
    const { buildSystemPrompt } = await import('./agent-prompt');
    const prompt = await buildSystemPrompt(
      '你是测试助手。',
      { triggeredRun: { targetChatId: 'oc_123' } },
      fakeExec as any
    );
    expect(prompt).toContain('定时触发');
    expect(prompt).toContain('oc_123'); // target chat surfaced to the model
    expect(prompt).toContain('以 bot 身份代发'); // the "don't send / bot delivers" rule
    expect(prompt).toContain('--as user'); // the "don't use --as user" instruction
  });

  it('omits the target-chat id line when targetChatId is absent', async () => {
    vi.resetModules();
    const { buildSystemPrompt } = await import('./agent-prompt');
    const prompt = await buildSystemPrompt(
      '你是测试助手。',
      { triggeredRun: { targetChatId: null } },
      fakeExec as any
    );
    expect(prompt).toContain('定时触发');
    expect(prompt).toContain('不会被自动发送');
    expect(prompt).not.toContain('oc_');
  });
});

describe('buildSystemPrompt clarification protocol', () => {
  it('appends the ask-before-acting protocol on the message path', async () => {
    vi.resetModules();
    const { buildSystemPrompt } = await import('./agent-prompt');
    const prompt = await buildSystemPrompt('你是助手。', undefined, fakeExec as any);

    expect(prompt).toContain('信息不足时先问清楚再动手');
    expect(prompt).toContain('不要猜参数硬做');
    expect(prompt).toContain('停下等');
  });

  it('keeps the "do it in-turn" rule but carves out the ask path (no contradiction)', async () => {
    vi.resetModules();
    const { buildSystemPrompt } = await import('./agent-prompt');
    const prompt = await buildSystemPrompt('你是助手。', undefined, fakeExec as any);

    expect(prompt).toContain('不要中途停下等用户追问');
    expect(prompt).toContain('信息不足');
  });

  it('suppresses clarifying questions in triggered-run mode', async () => {
    vi.resetModules();
    const { buildSystemPrompt } = await import('./agent-prompt');
    const prompt = await buildSystemPrompt(
      '你是助手。',
      { triggeredRun: { targetChatId: 'oc_123' } },
      fakeExec as any
    );

    expect(prompt).toContain('不要抛澄清问题');
  });
});
