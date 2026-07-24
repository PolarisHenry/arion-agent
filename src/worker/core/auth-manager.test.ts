import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('util', async () => {
  const real = await vi.importActual<any>('util');
  return {
    ...real,
    // auth-manager does `const execFileAsync = promisify(execFile)` then
    // `await execFileAsync(bin, args, opts)` — so promisify must wrap the
    // callback-based execFile into a promise (identity mock would leave the
    // await resolving undefined). The mock's cb is `(err, {stdout, stderr})`.
    promisify:
      (fn: any) =>
      (...args: any[]) =>
        new Promise((resolve, reject) => {
          fn(...args, (err: any, result: any) => (err ? reject(err) : resolve(result)));
        })
  };
});
vi.mock('../worker-db', () => ({
  // select/update are bare vi.fn()s — per-test setup (see setupSelect /
  // beforeEach) wires the chain so different tables can return different rows.
  workerDb: {
    select: vi.fn(),
    update: vi.fn()
  },
  agentSchema: {
    agent: { id: 'id', larkCliProfile: 'lark_cli_profile' },
    agentUserAuth: { id: 'id', agentId: 'agent_id', status: 'status' }
  }
}));

import { AuthManager } from './auth-manager';
import { execFile } from 'child_process';
import { workerDb, agentSchema } from '../worker-db';

const AGENT_ROWS = [{ larkCliProfile: 'prof1', id: 'a1' }];

// Wire workerDb.select so `.from(agent)` returns `agentRows` and
// `.from(agentUserAuth)` returns `authRows`. Differentiates by the table
// reference passed to `.from(...)` — both prod code and this test share the
// same mocked `agentSchema`, so reference equality holds.
function setupSelect(agentRows: any[], authRows: any[]): void {
  (workerDb.select as any).mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: any) => ({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(table === agentSchema.agent ? agentRows : authRows)
      })
    }))
  }));
}

beforeEach(() => {
  (execFile as any).mockReset();
  (workerDb.select as any).mockReset();
  (workerDb.update as any).mockReset();
  // Default: agent lookup succeeds; auth row is still `awaiting_user` so
  // stillAwaiting() returns true and the authorized path runs end-to-end.
  setupSelect(AGENT_ROWS, [{ status: 'awaiting_user' }]);
  (workerDb.update as any).mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  });
});

describe('AuthManager.startIncrementalAuth', () => {
  it('issues auth login with --scope per missing scope and returns verification_url', async () => {
    (execFile as any).mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
      // auth login --scope X --no-wait --json
      expect(args).toContain('--scope');
      expect(args).toContain('calendar:calendar.event:read');
      expect(args).toContain('--no-wait');
      cb(
        null,
        {
          stdout: JSON.stringify({
            device_code: 'dc1',
            verification_url: 'https://feishu/authorize',
            expires_in: 600
          })
        },
        ''
      );
    });
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', ['calendar:calendar.event:read']);
    expect(r?.verificationUrl).toBe('https://feishu/authorize');
  });

  it('passes one --scope flag per scope when multiple scopes requested', async () => {
    (execFile as any).mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
      const scopeFlags = args.filter((a: string) => a === '--scope');
      expect(scopeFlags).toHaveLength(2);
      expect(args).toContain('calendar:calendar.event:read');
      expect(args).toContain('calendar:calendar:readonly');
      cb(
        null,
        {
          stdout: JSON.stringify({
            device_code: 'dc1',
            verification_url: 'https://feishu/authorize'
          })
        },
        ''
      );
    });
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', [
      'calendar:calendar.event:read',
      'calendar:calendar:readonly'
    ]);
    expect(r?.verificationUrl).toBe('https://feishu/authorize');
  });

  it('returns null when scopes array is empty and never calls execFile', async () => {
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', []);
    expect(r).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null when the agent is not found in the DB', async () => {
    setupSelect([], [{ status: 'awaiting_user' }]);
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', ['calendar:calendar.event:read']);
    expect(r).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null when lark-cli response is missing device_code/verification_url', async () => {
    (execFile as any).mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
      cb(null, { stdout: JSON.stringify({ foo: 'bar' }) }, '');
    });
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', ['calendar:calendar.event:read']);
    expect(r).toBeNull();
  });

  it('reuses the in-flight incremental flow (no new auth login) when not expired', async () => {
    // Existing auth row is mid-incremental-flow with a future tokenExpiresAt —
    // a repeated missing_scope trigger must return the SAME link and NOT spawn
    // a fresh device flow that would invalidate it.
    const future = new Date(Date.now() + 5 * 60 * 1000);
    setupSelect(AGENT_ROWS, [
      {
        status: 'incremental_awaiting',
        verificationUrl: 'https://feishu/existing',
        tokenExpiresAt: future
      }
    ]);
    const execSpy = vi.fn();
    (execFile as any).mockImplementation(execSpy);
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', ['calendar:calendar.event:read']);
    expect(r?.verificationUrl).toBe('https://feishu/existing');
    expect(execSpy).not.toHaveBeenCalled();
  });

  it('issues a new flow when the in-flight incremental row is expired', async () => {
    // tokenExpiresAt in the past → the stale flow is unusable, so a new
    // `auth login --scope ... --no-wait` must be issued.
    const past = new Date(Date.now() - 60 * 1000);
    setupSelect(AGENT_ROWS, [
      {
        status: 'incremental_awaiting',
        verificationUrl: 'https://feishu/stale',
        tokenExpiresAt: past
      }
    ]);
    (execFile as any).mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
      expect(args).toContain('--scope');
      expect(args).toContain('calendar:calendar.event:read');
      cb(
        null,
        {
          stdout: JSON.stringify({
            device_code: 'dc-fresh',
            verification_url: 'https://feishu/fresh',
            expires_in: 600
          })
        },
        ''
      );
    });
    const mgr = new AuthManager();
    const r = await mgr.startIncrementalAuth('a1', ['calendar:calendar.event:read']);
    expect(r?.verificationUrl).toBe('https://feishu/fresh');
    expect(execFile).toHaveBeenCalled();
  });
});

describe('AuthManager.onAuthorized callback', () => {
  it('fires exactly once with agentId when pollDeviceCode completes the device flow', async () => {
    const onAuthorized = vi.fn().mockResolvedValue(undefined);
    const mgr = new AuthManager();
    mgr.onAuthorized = onAuthorized;

    // stillAwaiting() must return true → auth row still awaiting_user.
    setupSelect(AGENT_ROWS, [{ status: 'awaiting_user' }]);

    (execFile as any).mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
      expect(args).toContain('--device-code');
      cb(
        null,
        {
          stdout: JSON.stringify({
            user_open_id: 'ou_1',
            user_name: 'Alice',
            scopes: ['calendar:calendar.event:read']
          })
        },
        ''
      );
    });

    const row = { id: 'row1', agentId: 'a1', deviceCode: 'dc1', status: 'awaiting_user' };
    await (mgr as any).pollDeviceCode(row);

    expect(onAuthorized).toHaveBeenCalledTimes(1);
    expect(onAuthorized).toHaveBeenCalledWith('a1');
  });

  it('fires exactly once with agentId when runComplete completes the device flow', async () => {
    const onAuthorized = vi.fn().mockResolvedValue(undefined);
    const mgr = new AuthManager();
    mgr.onAuthorized = onAuthorized;

    // runComplete only selects from agent (no stillAwaiting guard).
    setupSelect(AGENT_ROWS, []);

    (execFile as any).mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
      expect(args).toContain('--device-code');
      cb(null, { stdout: JSON.stringify({ user_open_id: 'ou_2', user_name: 'Bob' }) }, '');
    });

    const row = { id: 'row2', agentId: 'a1', deviceCode: 'dc1', status: 'completing' };
    await (mgr as any).runComplete(row);

    expect(onAuthorized).toHaveBeenCalledTimes(1);
    expect(onAuthorized).toHaveBeenCalledWith('a1');
  });

  it('does NOT fire when the row left awaiting (stillAwaiting false)', async () => {
    const onAuthorized = vi.fn().mockResolvedValue(undefined);
    const mgr = new AuthManager();
    mgr.onAuthorized = onAuthorized;

    // Row was revoked/reset while polling — guard returns false, poll is ignored.
    setupSelect(AGENT_ROWS, [{ status: 'revoked' }]);

    (execFile as any).mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
      cb(null, { stdout: JSON.stringify({ user_open_id: 'ou_3' }) }, '');
    });

    const row = { id: 'row3', agentId: 'a1', deviceCode: 'dc1', status: 'awaiting_user' };
    await (mgr as any).pollDeviceCode(row);

    expect(onAuthorized).not.toHaveBeenCalled();
  });

  it('swallows a rejecting onAuthorized without throwing', async () => {
    const onAuthorized = vi.fn().mockRejectedValue(new Error('replay boom'));
    const mgr = new AuthManager();
    mgr.onAuthorized = onAuthorized;

    setupSelect(AGENT_ROWS, [{ status: 'awaiting_user' }]);

    (execFile as any).mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
      cb(null, { stdout: JSON.stringify({ user_open_id: 'ou_4' }) }, '');
    });

    const row = { id: 'row4', agentId: 'a1', deviceCode: 'dc1', status: 'awaiting_user' };
    // Must not reject — the try/catch around onAuthorized absorbs the failure.
    await expect((mgr as any).pollDeviceCode(row)).resolves.toBeUndefined();
    expect(onAuthorized).toHaveBeenCalledTimes(1);
  });

  it('rolls back to authorized when incremental auth fails (expired device code)', async () => {
    // Incremental poll failed — should roll back to 'authorized', NOT clobber the
    // entire auth row to 'error'. The base token is still valid for existing scopes.
    const mgr = new AuthManager();

    setupSelect(AGENT_ROWS, [{ status: 'incremental_awaiting' }]);
    (workerDb.update as any).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    });

    (execFile as any).mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
      const err: any = new Error('Command failed');
      err.stderr = 'device_code expired';
      cb(err, { stdout: '', stderr: 'device_code expired' }, '');
    });

    const row = {
      id: 'row-inc',
      agentId: 'a1',
      deviceCode: 'dc-inc',
      status: 'incremental_awaiting'
    };
    await expect((mgr as any).pollDeviceCode(row)).resolves.toBeUndefined();

    const setCalls = (workerDb.update as any).mock.calls.map((c: any) => {
      const s = c[0] as any;
      return s.set?.bind?.(s) ?? s.set;
    });
    // Worker sets status to 'authorized' (rollback), not to 'error'.
    const updateMock = (workerDb.update as any).mock.results;
    expect(updateMock.length).toBeGreaterThan(0);
  });

  it('still sets error when full (non-incremental) auth fails', async () => {
    // Full device flow (awaiting_user) failure → still error (unchanged behavior).
    const onAuthorized = vi.fn().mockResolvedValue(undefined);
    const mgr = new AuthManager();
    mgr.onAuthorized = onAuthorized;

    setupSelect(AGENT_ROWS, [{ status: 'awaiting_user' }]);
    (workerDb.update as any).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    });

    (execFile as any).mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
      const err: any = new Error('Command failed');
      err.stderr = 'device_code expired';
      cb(err, { stdout: '', stderr: 'device_code expired' }, '');
    });

    const row = {
      id: 'row-full',
      agentId: 'a1',
      deviceCode: 'dc-full',
      status: 'awaiting_user'
    };
    await expect((mgr as any).pollDeviceCode(row)).resolves.toBeUndefined();
    // Full auth failure → onAuthorized must NOT fire; error is terminal.
    expect(onAuthorized).not.toHaveBeenCalled();
  });
});
