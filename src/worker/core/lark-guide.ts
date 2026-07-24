import { execFileAsync } from './exec';
import { config } from '../config';
import { createLogger } from './logger';

const log = createLogger('lark-guide');

export type ExecFn = (
  file: string,
  args: string[],
  opts?: Record<string, unknown>
) => Promise<{ stdout: string; stderr: string }>;

// Fixed guidance appended alongside the domain index. The domain list is
// auto-derived from `lark-cli --help`; these rules are stable conventions.
export const USAGE_RULES = [
  '## Lark CLI 使用准则（务必遵守）',
  '- 你通过 run_lark_cli 直接驱动 lark-cli。命令形如 `lark-cli <域> <子命令> [flags]`，argv 以数组传入。',
  '- 优先用 `+shortcut`（高级任务，如 `calendar +agenda`）；匹配不上再用原生 API method（如 `calendar events list`）。',
  '- 不确定某命令的参数时，先调 schema 工具查（如 `calendar.events.create`），再调 run_lark_cli。',
  '- 要用某域的深度用法（多步流程、身份要求、常见坑）时，先调 read_skill 读该域的 SKILL.md。',
  '- 身份选择以该操作 skill 的标注为准（支持 user / bot / 仅 user / 仅 bot）。不确定时先 `read_skill` 读该域说明，按它说的选 `--as user` 或 `--as bot`，不要凭感觉猜。',
  '- 高危操作（high-risk-write）：run_lark_cli 第一次会自动走 `--dry-run` 返回预览；你确认预览与用户意图一致后，带 `--yes` 再调一次才真正执行。',
  '- 输出默认 JSON；可用 `--jq` 精简、`--format json`。'
].join('\n');

/** Parse the `Lark domains:` block out of `lark-cli --help` stdout. Pure. */
export function parseDomainsFromHelp(helpStdout: string): { name: string; description: string }[] {
  const start = helpStdout.indexOf('Lark domains:');
  if (start === -1) return [];
  const rest = helpStdout.slice(start + 'Lark domains:'.length);
  const lines: { name: string; description: string }[] = [];
  for (const raw of rest.split('\n')) {
    if (raw.length === 0) continue;
    // The block ends at the first non-indented line (a header like "Agent tooling:").
    if (!/^\s+\S/.test(raw)) break;
    const trimmed = raw.trim();
    const sp = trimmed.indexOf(' ');
    lines.push(
      sp === -1
        ? { name: trimmed, description: '' }
        : { name: trimmed.slice(0, sp), description: trimmed.slice(sp + 1).trim() }
    );
  }
  return lines;
}

let cachedGuide = '';

/** Build the system-prompt section: domain index + usage rules. Memoized by
 *  `lark-cli --version` so it rebuilds only when the binary actually changes
 *  (i.e. after an npm package bump + redeploy, which reloads this module and
 *  resets cachedVersion/cachedGuide). `exec` is injectable for tests.
 *  Fault-tolerant: if introspection throws (binary missing, timeout), caches +
 *  returns a rules-only fallback so conversations never go silent. */
export async function buildLarkGuide(
  exec: ExecFn = execFileAsync as unknown as ExecFn
): Promise<string> {
  // Short-circuit before any exec call: once the cache is populated for this
  // process it stays valid (the binary can't change under us; only a redeploy
  // can, which reloads the module and clears both vars).
  if (cachedGuide) return cachedGuide;

  try {
    const ver = (
      await exec(config.larkCliPath, ['--version'], { encoding: 'utf8', timeout: 10_000 })
    ).stdout.trim();
    const help = (await exec(config.larkCliPath, ['--help'], { encoding: 'utf8', timeout: 10_000 }))
      .stdout;
    const domains = parseDomainsFromHelp(help);
    const index = [
      '## Lark 可用域（lark-cli 自省，随版本自动更新）',
      ...domains.map((d) => `- \`${d.name}\` — ${d.description}`),
      ''
    ].join('\n');

    cachedGuide = `\n\n${index}\n${USAGE_RULES}`;
    log.info(`lark guide built for ${ver} (${domains.length} domains)`);
  } catch (err: any) {
    log.warn(`lark guide introspection failed; using rules-only fallback: ${err?.message ?? err}`);
    cachedGuide = `\n\n${USAGE_RULES}`;
  }
  return cachedGuide;
}
