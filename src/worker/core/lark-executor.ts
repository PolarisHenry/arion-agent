import { execFileAsync } from './exec';
import { config } from '../config';
import { createLogger } from './logger';
import type { ExecFn } from './lark-guide';
import type { ToolContext } from './tools';

const log = createLogger('lark-executor');

// Moved verbatim from tools.ts (see Task 4 for the removal there).
function extractEnvelope(raw: string | undefined): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // not pure JSON — fall through
  }
  let i = raw.indexOf('{');
  while (i !== -1) {
    try {
      return JSON.parse(raw.slice(i));
    } catch {
      i = raw.indexOf('{', i + 1);
    }
  }
  return null;
}

/** Interpret a lark-cli failure envelope into an agent-friendly message.
 *  `label` is a short identifier for the call (e.g. the joined argv). */
export function interpretLarkError(
  err: { stderr?: string; stdout?: string; message?: string; status?: number; code?: number },
  label: string,
  ctx: ToolContext
): string {
  const parsed = extractEnvelope(err.stderr) ?? extractEnvelope(err.stdout);
  const error = parsed?.error;

  if (error && (error.subtype === 'missing_scope' || error.type === 'authorization')) {
    if (error.subtype === 'permission_denied') {
      return [
        `[权限不足] ${label}: ${error.message ?? 'bot 无权访问该资源'}`,
        `这是资源级权限(不是 scope 问题)——应用还不是目标资源的成员/协作者。`,
        error.hint ? `hint: ${error.hint}` : '',
        `应用 appId: ${ctx.appId}。请把以上转达给用户：需要到飞书后台把该应用加成对应资源的编辑成员；用户回复前，不要重试本命令。`,
        error.troubleshooter ? `排查链接: ${error.troubleshooter}` : ''
      ]
        .filter(Boolean)
        .join('\n');
    }
    const scopes: string[] = error.missing_scopes ?? [];
    const consoleUrl: string | undefined = error.console_url;
    let permissionUrl: string;
    if (consoleUrl) {
      permissionUrl = consoleUrl;
    } else if (scopes.length > 0 && ctx.appId) {
      permissionUrl = `https://open.feishu.cn/page/scope-apply?clientID=${encodeURIComponent(ctx.appId)}&scopes=${encodeURIComponent(scopes.join(','))}`;
    } else {
      permissionUrl = '';
    }
    const scopeList = scopes.length > 0 ? scopes.join(', ') : '(unknown)';
    return [
      `[权限不足] ${label} 需要 scope: ${scopeList}`,
      permissionUrl
        ? `请点此开通（复制到浏览器）:\n${permissionUrl}`
        : `请到飞书开发者后台为应用 ${ctx.appId} 开通上述 scope。`,
      `请把以上内容（含开通链接）原样转达给用户，并请用户在浏览器开通后回复你；在用户回复“已开通”之前，不要重试本命令。`
    ].join('\n');
  }

  const errMsg = error?.message ?? '';
  if (
    error?.type === 'authentication' ||
    error?.subtype === 'token_missing' ||
    /need_user_authorization/i.test(errMsg)
  ) {
    return [
      `[用户授权失效] ${label} 需要以用户身份操作，但用户授权已失效（token 丢失或过期）。`,
      `请把以上转达给用户：需要到 dashboard → 该智能体 →「用户身份」→ 重新授权；用户回复前，不要重试本命令。`,
      `（若刚重启过 worker，授权状态会自动恢复，届时可让用户回复后再重试一次。）`
    ].join('\n');
  }

  if (error?.subtype === 'confirmation_required' || err.code === 10) {
    const risk = error?.risk ?? 'high-risk-write';
    const action = error?.action ? JSON.stringify(error.action) : '(no details)';
    return [
      `[需要确认] 这是高风险操作（${risk}）:`,
      action,
      `请把以上预览转达给用户，等用户回复“确认”后，再带 --yes 重调 run_lark_cli。`
    ].join('\n');
  }

  const code = error?.code;
  const message = error?.message ?? err.message ?? String(err);
  const hint = error?.hint;
  let result = `[调用失败] ${message}`;
  if (hint) result += `\n提示: ${hint}`;
  if (code) result += ` (code ${code})`;
  return result;
}

const EXEC_OPTS = {
  encoding: 'utf8',
  timeout: 30_000,
  maxBuffer: 1024 * 1024 * 4,
  env: {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1'
  }
};

function buildArgv(argv: string[], ctx: ToolContext): string[] {
  return ['--profile', ctx.profile, ...argv];
}

/** Strip any LLM-supplied --profile / --profile=... and a leading binary name so
 *  the worker-injected ctx.profile (prepended by buildArgv) cannot be overridden.
 *  cobra keeps the last duplicate flag, so an injected --profile would win. */
function sanitizeArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') {
      i++;
      continue;
    } // drop value too
    if (typeof a === 'string' && a.startsWith('--profile=')) continue;
    if (i === 0 && a === 'lark-cli') continue; // leading binary token
    out.push(a);
  }
  return out;
}

/** If stdout is an lark-cli ok:false failure envelope, return an interpreted
 *  message; otherwise null (caller returns stdout as the success result). */
function interpretIfFailed(stdout: string, label: string, ctx: ToolContext): string | null {
  const env = extractEnvelope(stdout);
  if (env?.ok === false) {
    return interpretLarkError({ stdout, stderr: stdout, message: env.error?.message }, label, ctx);
  }
  return null;
}

/** If `env` is a user-identity missing_scope envelope, fire the reactive
 *  incremental-auth hook (ctx.authHooks.onMissingUserScope) and return the
 *  agent-facing verification-URL message. Returns null when:
 *  - the envelope is not a user missing_scope (bot, or a different error), or
 *  - no hook is wired up (ctx.authHooks / agentId / ownerId missing), or
 *  - the hook returned no verification URL, or threw.
 *  Caller falls back to the legacy interpretLarkError on null. */
async function tryUserMissingScope(
  env: any,
  clean: string[],
  ctx: ToolContext
): Promise<string | null> {
  if (!(env?.ok === false && env.identity === 'user' && env.error?.subtype === 'missing_scope')) {
    return null;
  }
  const scopes: string[] = env.error.missing_scopes ?? [];
  if (ctx.authHooks && ctx.agentId && ctx.ownerId) {
    try {
      const r = await ctx.authHooks.onMissingUserScope(
        ctx.agentId,
        ctx.ownerId,
        scopes,
        ctx.chatId,
        clean
      );
      if (r?.verificationUrl) {
        return [
          `[需要授权] 这条命令需要新权限: ${scopes.join(', ')}`,
          `请点此授权(复制到浏览器打开):\n${r.verificationUrl}`,
          `授权完成后我会自动继续处理,授权完成前请勿重试本命令。`
        ].join('\n');
      }
    } catch (e: any) {
      log.warn(`onMissingUserScope hook failed: ${e?.message ?? e}`);
    }
  }
  return null;
}

/** Execute an arbitrary lark-cli command. lark-cli returns failures via TWO
 *  different shapes (verified via probe against the real binary):
 *  - NONZERO-exit + stderr envelope (exit 3 for missing_scope / auth errors):
 *    the JSON envelope ({ok:false,error:{...}}) is written to STDERR and the
 *    process exits nonzero, so exec() rejects and we catch it.
 *  - exit-0 + stdout envelope (ok:false): used for confirmation_required on
 *    high-risk writes (and historically seen for some auth envelopes); the
 *    envelope is on STDOUT and exec() resolves.
 *  Both paths are inspected for ok:false and routed to interpretLarkError.
 *  High-risk writes without --yes are auto-previewed via --dry-run and returned
 *  with a hint to re-call with --yes. User-identity missing_scope triggers the
 *  reactive incremental-auth hook (tryUserMissingScope) on EITHER path. */
export async function runLarkCli(
  argv: string[],
  ctx: ToolContext,
  exec: ExecFn = execFileAsync as unknown as ExecFn
): Promise<string> {
  const clean = sanitizeArgv(argv);
  const full = buildArgv(clean, ctx);
  const label = clean.join(' ');
  log.info(`run_lark_cli: ${label}`);

  let stdout: string;
  try {
    const r = await exec(config.larkCliPath, full, EXEC_OPTS);
    stdout = r.stdout ?? '';
  } catch (err: any) {
    // Nonzero exit: lark-cli wrote the JSON envelope to stderr (or stdout).
    // Real missing_scope / auth failures land here (e.g. exit 3 + stderr).
    // Try the reactive user-identity hook BEFORE the legacy interpreter.
    const env = extractEnvelope(err.stderr) ?? extractEnvelope(err.stdout);
    const hooked = await tryUserMissingScope(env, clean, ctx);
    if (hooked) return hooked;
    return interpretLarkError(err, label, ctx);
  }

  // Exit 0, but lark-cli may still return a failure as a stdout envelope with
  // ok:false (confirmation_required, missing_scope, auth, ...). Detect + route.
  const env = extractEnvelope(stdout);
  if (
    env?.ok === false &&
    env.error?.subtype === 'confirmation_required' &&
    !clean.includes('--yes')
  ) {
    // High-risk write refused without --yes → preview via dry-run, ask the LLM
    // to confirm before re-calling with --yes.
    try {
      const dry = await exec(config.larkCliPath, [...full, '--dry-run'], EXEC_OPTS);
      return [
        `[dry-run 预览] 这是高危操作，未真正执行。请把下方预览转达给用户，等用户回复“确认”后，再带 --yes 重调 run_lark_cli。`,
        dry.stdout?.trim() || '(dry-run 无输出)'
      ].join('\n');
    } catch (dryErr: any) {
      return interpretLarkError(dryErr, label, ctx);
    }
  }
  // User-identity missing_scope → reactive incremental auth (if hooked).
  // Distinguished from bot missing_scope (legacy: send user to dev console).
  // (Some lark-cli paths return missing_scope as exit-0 stdout; the exit-3
  // stderr variant is handled in the catch above. Both go through the same
  // helper so the hook fires regardless of transport.)
  const hooked = await tryUserMissingScope(env, clean, ctx);
  if (hooked) return hooked;
  // Any other ok:false envelope (missing_scope / auth / generic, or a
  // confirmation_required that arrived with --yes) → friendly interpreted msg.
  const failed = interpretIfFailed(stdout, label, ctx);
  if (failed) return failed;

  return stdout.trim() || '(tool returned empty result)';
}

export async function readSkill(
  domain: string,
  ctx: ToolContext,
  exec: ExecFn = execFileAsync as unknown as ExecFn
): Promise<string> {
  // All skills are `lark-*`. Tolerate the agent passing the bare CLI domain it
  // is reasoning about (e.g. `sheets` / `calendar`) by normalising to the skill
  // name. The skill index already exposes correct names — this is a backstop.
  const name = domain && domain.startsWith('lark-') ? domain : `lark-${domain}`;
  const label = `skills read ${name}`;
  try {
    const r = await exec(config.larkCliPath, buildArgv(['skills', 'read', name], ctx), EXEC_OPTS);
    const failed = interpretIfFailed(r.stdout ?? '', label, ctx);
    if (failed) return failed;
    return r.stdout?.trim() || '(skill 为空)';
  } catch (err: any) {
    return interpretLarkError(err, label, ctx);
  }
}

export async function larkSchema(
  method: string,
  ctx: ToolContext,
  exec: ExecFn = execFileAsync as unknown as ExecFn
): Promise<string> {
  const label = `schema ${method}`;
  try {
    const r = await exec(config.larkCliPath, buildArgv(['schema', method], ctx), EXEC_OPTS);
    const failed = interpretIfFailed(r.stdout ?? '', label, ctx);
    if (failed) return failed;
    return r.stdout?.trim() || '(schema 为空)';
  } catch (err: any) {
    return interpretLarkError(err, label, ctx);
  }
}
