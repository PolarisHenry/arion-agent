import { execFileAsync } from './exec';
import { config } from '../config';
import { createLogger } from './logger';

const log = createLogger('lark-guide');

export type ExecFn = (
  file: string,
  args: string[],
  opts?: Record<string, unknown>
) => Promise<{ stdout: string; stderr: string }>;

// Fixed guidance appended alongside the skill index. The skill list is
// auto-derived from `lark-cli skills list`; these rules are stable conventions.
export const USAGE_RULES = [
  '## Lark CLI 使用准则（务必遵守）',
  '- 你通过 run_lark_cli 直接驱动 lark-cli。命令形如 `lark-cli <域> <子命令> [flags]`，argv 以数组传入。',
  '- 优先用 `+shortcut`（高级任务，如 `calendar +agenda`）；匹配不上再用原生 API method（如 `calendar events list`）。',
  '- 不确定某命令的参数时，先调 schema 工具查（如 `calendar.events.create`），再调 run_lark_cli。',
  '- 要用某 skill 的深度用法（多步流程、身份要求、常见坑）时，先调 read_skill 读它的 SKILL.md；read_skill 传下面列出的 skill 名（带 `lark-` 前缀）。',
  '- skill 名去掉 `lark-` 前缀就是 run_lark_cli 的域：`lark-sheets` → 域 `sheets`。',
  '- 身份选择以该操作 skill 的标注为准（支持 user / bot / 仅 user / 仅 bot）。不确定时先 `read_skill` 读该 skill 说明，按它说的选 `--as user` 或 `--as bot`，不要凭感觉猜。',
  '- 高危操作（high-risk-write）：run_lark_cli 第一次会自动走 `--dry-run` 返回预览；你确认预览与用户意图一致后，带 `--yes` 再调一次才真正执行。',
  '- 输出默认 JSON；可用 `--jq` 精简、`--format json`。'
].join('\n');

/** Parse `lark-cli skills list` JSON stdout into skill names. Pure. Tolerates a
 *  bare array or an `{ skills: [] }` envelope; non-JSON or missing `skills`
 *  returns []. Only the name is kept — the rich per-skill description lives in
 *  SKILL.md and is read on demand via read_skill, so the system prompt stays
 *  thin. Keeping names (not the CLI `--help` domain block) here is what lets
 *  read_skill resolve on the first try: the skill name and the CLI domain
 *  don't always match (e.g. domain `docs` → skill `lark-doc`), and several
 *  skills (lark-shared / lark-skill-maker / lark-openapi-explorer) are not CLI
 *  domains at all and would otherwise be invisible to the agent. */
export function parseSkillsList(jsonStdout: string): { name: string }[] {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStdout);
  } catch {
    return [];
  }
  const skills = Array.isArray(parsed) ? parsed : parsed?.skills;
  if (!Array.isArray(skills)) return [];
  return skills
    .map((s: any) => String(s?.name ?? '').trim())
    .filter((name: string) => name.length > 0)
    .map((name: string) => ({ name }));
}

let cachedGuide = '';

/** Build the system-prompt section: skill name index + usage rules. Memoized
 *  by process lifetime — the binary can't change under us; only a redeploy can,
 *  which reloads this module and clears cachedGuide. `exec` is injectable for
 *  tests. Fault-tolerant: if introspection throws (binary missing, timeout),
 *  caches + returns a rules-only fallback so conversations never go silent. */
export async function buildLarkGuide(
  exec: ExecFn = execFileAsync as unknown as ExecFn
): Promise<string> {
  // Short-circuit before any exec call: once the cache is populated for this
  // process it stays valid (the binary can't change under us; only a redeploy
  // can, which reloads the module and clears cachedGuide).
  if (cachedGuide) return cachedGuide;

  try {
    const ver = (
      await exec(config.larkCliPath, ['--version'], { encoding: 'utf8', timeout: 10_000 })
    ).stdout.trim();
    const list = (
      await exec(config.larkCliPath, ['skills', 'list'], { encoding: 'utf8', timeout: 10_000 })
    ).stdout;
    const skills = parseSkillsList(list);
    const index = [
      '## Lark 可用 skill（lark-cli skills list 自省，随版本自动更新；read_skill 传下面的名字）',
      ...skills.map((s) => `- \`${s.name}\``),
      ''
    ].join('\n');

    cachedGuide = `\n\n${index}\n${USAGE_RULES}`;
    log.info(`lark guide built for ${ver} (${skills.length} skills)`);
  } catch (err: any) {
    log.warn(`lark guide introspection failed; using rules-only fallback: ${err?.message ?? err}`);
    cachedGuide = `\n\n${USAGE_RULES}`;
  }
  return cachedGuide;
}
