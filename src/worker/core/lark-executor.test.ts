import { describe, it, expect, vi } from 'vitest';
import { runLarkCli, readSkill, larkSchema } from './lark-executor';
import type { ToolContext } from './tools';

const ctx: ToolContext = { profile: 'prof1', appId: 'cli_x', asUser: false };

function makeExec(
  responses: Array<{ stdout?: string; stderr?: string; code?: number; error?: any }>
) {
  let i = 0;
  return vi.fn(async (_f: string, _args: string[]) => {
    const r = responses[i++] ?? responses[responses.length - 1];
    if (r.error) throw r.error;
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  });
}

describe('runLarkCli', () => {
  it('prepends --profile and passes argv through as array', async () => {
    const exec = makeExec([{ stdout: '{"ok":true}' }]);
    await runLarkCli(['calendar', '+agenda', '--as', 'user'], ctx, exec as any);
    expect(exec).toHaveBeenCalledWith(
      expect.any(String),
      ['--profile', 'prof1', 'calendar', '+agenda', '--as', 'user'],
      expect.any(Object)
    );
  });

  // lark-cli returns high-risk confirmation as an exit-0 STDOUT envelope with
  // ok:false (verified: `lark-cli drive +delete --file-token x --type file`
  // exits 0 and prints {ok:false,error:{subtype:'confirmation_required',...}}).
  // It is NOT a thrown error / exit 10. runLarkCli must detect the ok:false
  // envelope in the success path and re-run with --dry-run.
  it('on a confirmation_required envelope (exit 0, ok:false), re-runs with --dry-run and returns a preview + --yes hint', async () => {
    const confirmEnvelope = {
      stdout: JSON.stringify({
        ok: false,
        error: {
          subtype: 'confirmation_required',
          risk: 'high-risk-write',
          action: { summary: '周会' }
        }
      })
    };
    const exec = makeExec([
      confirmEnvelope,
      { stdout: '{"action":{"summary":"周会","start":"..."}}' }
    ]);
    const out = await runLarkCli(['calendar', '+update', '--event-id', 'x'], ctx, exec as any);
    expect(out).toContain('dry-run');
    expect(out).toContain('周会');
    expect(out).toContain('--yes');
    // second call appended --dry-run
    expect(exec.mock.calls[1][1]).toContain('--dry-run');
  });

  it('on a missing_scope envelope (exit 0, ok:false), surfaces an authorization message', async () => {
    const scopeEnvelope = {
      stdout: JSON.stringify({
        ok: false,
        identity: 'user',
        error: {
          type: 'authorization',
          subtype: 'missing_scope',
          missing_scopes: ['calendar:calendar'],
          message: 'missing scope'
        }
      })
    };
    const exec = makeExec([scopeEnvelope]);
    // No authHooks → falls back to the legacy scope-apply authorization message.
    const out = await runLarkCli(
      ['calendar', '+agenda', '--as', 'user'],
      { ...ctx, agentId: 'a1', ownerId: 'o1' },
      exec as any
    );
    expect(out).toContain('权限不足');
    expect(out).toContain('calendar:calendar');
    // terminal-state nudge: must tell the model to relay to the user and NOT retry
    expect(out).toContain('转达给用户');
    expect(out).toContain('不要重试');
  });

  it('on a USER missing_scope envelope with authHooks, returns the verification URL (not scope-apply)', async () => {
    const scopeEnvelope = {
      stdout: JSON.stringify({
        ok: false,
        identity: 'user',
        error: {
          type: 'authorization',
          subtype: 'missing_scope',
          missing_scopes: ['calendar:calendar.event:read']
        }
      })
    };
    const exec = makeExec([scopeEnvelope]);
    const onMissingUserScope = vi
      .fn()
      .mockResolvedValue({ verificationUrl: 'https://feishu/auth/xyz' });
    const userCtx = {
      ...ctx,
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      authHooks: { onMissingUserScope }
    };
    const out = await runLarkCli(['calendar', '+agenda', '--as', 'user'], userCtx, exec as any);
    expect(onMissingUserScope).toHaveBeenCalledWith(
      'a1',
      'o1',
      ['calendar:calendar.event:read'],
      'c1',
      ['calendar', '+agenda', '--as', 'user']
    );
    expect(out).toContain('https://feishu/auth/xyz');
    expect(out).not.toContain('scope-apply');
  });

  it('on a USER missing_scope WITHOUT authHooks, falls back to legacy authorization message', async () => {
    const scopeEnvelope = {
      stdout: JSON.stringify({
        ok: false,
        identity: 'user',
        error: {
          type: 'authorization',
          subtype: 'missing_scope',
          missing_scopes: ['calendar:calendar.event:read']
        }
      })
    };
    const exec = makeExec([scopeEnvelope]);
    const out = await runLarkCli(
      ['calendar', '+agenda', '--as', 'user'],
      { ...ctx, agentId: 'a1', ownerId: 'o1' },
      exec as any
    );
    expect(out).toContain('权限不足');
  });

  it('on a BOT missing_scope envelope, keeps the legacy console/scope-apply hint', async () => {
    const scopeEnvelope = {
      stdout: JSON.stringify({
        ok: false,
        identity: 'bot',
        error: {
          type: 'authorization',
          subtype: 'missing_scope',
          missing_scopes: ['calendar:calendar']
        }
      })
    };
    const exec = makeExec([scopeEnvelope]);
    const onMissingUserScope = vi.fn();
    const out = await runLarkCli(
      ['calendar', '+agenda', '--as', 'bot'],
      { ...ctx, authHooks: { onMissingUserScope } },
      exec as any
    );
    expect(onMissingUserScope).not.toHaveBeenCalled();
    expect(out).toContain('转达给用户');
  });

  // ---- REAL lark-cli path: missing_scope arrives as NONZERO-exit + stderr ----
  // Verified in the worker container: `lark-cli ... calendar +agenda --as user --json`
  // exits with code 3 and writes the {ok:false,error:{subtype:'missing_scope',...}}
  // envelope to STDERR (not stdout). The reactive hook MUST fire on this path too.
  function makeThrownErr(stderrEnv: string, code = 3) {
    return Object.assign(new Error('Command failed: lark-cli'), {
      code,
      status: code,
      stdout: '',
      stderr: stderrEnv
    });
  }

  it('on a USER missing_scope thrown via STDERR (exit 3) with authHooks, returns the verification URL (not scope-apply)', async () => {
    const stderrEnv = JSON.stringify({
      ok: false,
      identity: 'user',
      error: {
        type: 'authorization',
        subtype: 'missing_scope',
        missing_scopes: ['calendar:calendar.event:read'],
        message: 'missing required scope(s): calendar:calendar.event:read'
      }
    });
    const exec = makeExec([{ error: makeThrownErr(stderrEnv) }]);
    const onMissingUserScope = vi
      .fn()
      .mockResolvedValue({ verificationUrl: 'https://feishu/auth/xyz' });
    const userCtx = {
      ...ctx,
      agentId: 'a1',
      ownerId: 'o1',
      chatId: 'c1',
      authHooks: { onMissingUserScope }
    };
    const out = await runLarkCli(['calendar', '+agenda', '--as', 'user'], userCtx, exec as any);
    expect(onMissingUserScope).toHaveBeenCalledWith(
      'a1',
      'o1',
      ['calendar:calendar.event:read'],
      'c1',
      ['calendar', '+agenda', '--as', 'user']
    );
    expect(out).toContain('https://feishu/auth/xyz');
    expect(out).not.toContain('scope-apply');
  });

  it('on a BOT missing_scope thrown via STDERR (exit 3), keeps legacy hint and does NOT call the hook', async () => {
    const stderrEnv = JSON.stringify({
      ok: false,
      identity: 'bot',
      error: {
        type: 'authorization',
        subtype: 'missing_scope',
        missing_scopes: ['calendar:calendar.event:read']
      }
    });
    const exec = makeExec([{ error: makeThrownErr(stderrEnv) }]);
    const onMissingUserScope = vi.fn();
    const out = await runLarkCli(
      ['calendar', '+agenda', '--as', 'bot'],
      { ...ctx, authHooks: { onMissingUserScope } },
      exec as any
    );
    expect(onMissingUserScope).not.toHaveBeenCalled();
    // legacy interpretLarkError path: scope-apply URL + relay-to-user nudge
    expect(out).toContain('权限不足');
    expect(out).toContain('转达给用户');
  });

  it('on a USER missing_scope thrown via STDERR (exit 3) WITHOUT authHooks, falls back to legacy authorization message', async () => {
    const stderrEnv = JSON.stringify({
      ok: false,
      identity: 'user',
      error: {
        type: 'authorization',
        subtype: 'missing_scope',
        missing_scopes: ['calendar:calendar.event:read']
      }
    });
    const exec = makeExec([{ error: makeThrownErr(stderrEnv) }]);
    const out = await runLarkCli(
      ['calendar', '+agenda', '--as', 'user'],
      { ...ctx, agentId: 'a1', ownerId: 'o1' },
      exec as any
    );
    expect(out).toContain('权限不足');
    expect(out).toContain('calendar:calendar.event:read');
  });

  it('returns stdout on a normal read', async () => {
    const exec = makeExec([{ stdout: '{"items":[]}' }]);
    expect(await runLarkCli(['calendar', '+agenda'], ctx, exec as any)).toContain('items');
  });
});

describe('runLarkCli --profile sanitization', () => {
  it('strips an injected space-form --profile <attacker>, keeps ctx.profile (cobra keeps last)', async () => {
    const exec = makeExec([{ stdout: '{"ok":true}' }]);
    await runLarkCli(['--profile', 'attacker', 'calendar', '+agenda'], ctx, exec as any);
    expect(exec.mock.calls[0][1]).toEqual(['--profile', 'prof1', 'calendar', '+agenda']);
  });

  it('strips an injected --profile=attacker (equals form)', async () => {
    const exec = makeExec([{ stdout: '{"ok":true}' }]);
    await runLarkCli(['--profile=attacker', 'calendar', '+agenda'], ctx, exec as any);
    expect(exec.mock.calls[0][1]).toEqual(['--profile', 'prof1', 'calendar', '+agenda']);
  });

  it('strips a leading lark-cli binary token', async () => {
    const exec = makeExec([{ stdout: '{"ok":true}' }]);
    await runLarkCli(['lark-cli', 'calendar', '+agenda'], ctx, exec as any);
    expect(exec.mock.calls[0][1]).toEqual(['--profile', 'prof1', 'calendar', '+agenda']);
  });
});

describe('readSkill / larkSchema', () => {
  it('readSkill calls lark-cli skills read', async () => {
    const exec = makeExec([{ stdout: '# lark-calendar SKILL' }]);
    const out = await readSkill('lark-calendar', ctx, exec as any);
    expect(exec.mock.calls[0][1]).toEqual([
      '--profile',
      'prof1',
      'skills',
      'read',
      'lark-calendar'
    ]);
    expect(out).toContain('SKILL');
  });

  it('readSkill normalises a bare domain to the lark- skill name', async () => {
    const exec = makeExec([{ stdout: '# lark-calendar SKILL' }]);
    await readSkill('calendar', ctx, exec as any);
    expect(exec.mock.calls[0][1]).toEqual([
      '--profile',
      'prof1',
      'skills',
      'read',
      'lark-calendar'
    ]);
  });

  // SKILL.md is a routing doc that points to reference files (e.g. the formula
  // field guide); readSkill must let the agent fetch a specific reference by
  // appending its path to `skills read <name> <path>`.
  it('readSkill appends a reference path so the agent can read a sub-file', async () => {
    const exec = makeExec([{ stdout: '# Formula Writing Guide' }]);
    await readSkill('lark-base', ctx, exec as any, 'references/formula-field-guide.md');
    expect(exec.mock.calls[0][1]).toEqual([
      '--profile',
      'prof1',
      'skills',
      'read',
      'lark-base',
      'references/formula-field-guide.md'
    ]);
    expect(exec.mock.calls[0][1]).not.toContain('');
  });

  it('larkSchema calls lark-cli schema', async () => {
    const exec = makeExec([{ stdout: '{"name":"x"}' }]);
    await larkSchema('calendar.events.create', ctx, exec as any);
    expect(exec.mock.calls[0][1]).toEqual([
      '--profile',
      'prof1',
      'schema',
      'calendar.events.create'
    ]);
  });

  it('readSkill surfaces an exit-0 ok:false envelope as an authorization message (not raw JSON)', async () => {
    const scopeEnvelope = {
      stdout: JSON.stringify({
        ok: false,
        error: {
          type: 'authorization',
          subtype: 'missing_scope',
          missing_scopes: ['calendar:calendar'],
          message: 'missing scope'
        }
      })
    };
    const exec = makeExec([scopeEnvelope]);
    const out = await readSkill('lark-calendar', ctx, exec as any);
    expect(out).toContain('权限不足');
    expect(out).toContain('calendar:calendar');
    expect(out).not.toContain('missing_scope');
  });
});
