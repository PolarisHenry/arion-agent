// ============================================================
// System-prompt assembly — shared by the message path (agent-runtime)
// and the scheduler's triggered runs. Single source of truth: both paths
// see the same persona + lark guide + current time + tool discipline (+ an
// optional triggered-run block), so a triggered run is never left "blind"
// the way it was when the scheduler built its own stripped prompt and the
// fired agent had no rules, no identity guidance, and no idea its reply was
// auto-delivered.
// ============================================================

import { config } from '../config';
import { buildLarkGuide, type ExecFn } from './lark-guide';

// Build a "current time" context string in the configured timezone, appended to
// the system prompt so the model knows the real today/year for relative-time
// requests (e.g. "创建明天的日程" — without this, models default to their
// training cutoff year and put events in the wrong year).
function buildCurrentTimeContext(): string {
  const tz = config.agentTimezone;
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wdMap: Record<string, string> = {
    Mon: '周一',
    Tue: '周二',
    Wed: '周三',
    Thu: '周四',
    Fri: '周五',
    Sat: '周六',
    Sun: '周日'
  };
  const weekday = wdMap[get('weekday')] ?? get('weekday');
  // Intl may emit "24" for midnight with hour12:false — normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  const stamp = `${get('year')}-${get('month')}-${get('day')} ${weekday} ${hour}:${get('minute')}`;
  return `\n\n## 当前时间\n当前时间是 ${stamp}（${tz}）。处理“今天/明天/本周/下周/这个月”等相对时间时，请严格以当前时间为准，不要使用记忆中的旧日期。`;
}

// Agent tool-use discipline, appended to every system prompt so digital
// employees finish multi-step tasks in-turn instead of narrating intent and
// stalling ("我查一下" → silence, forcing the user to follow up).
function buildToolDiscipline(): string {
  return [
    '',
    '',
    '## 工具使用与任务完成纪律（务必遵守）',
    '- **遇到“需用户操作的终端状态”必须立刻转达并停下（优先级最高，高于“把任务做完”）。** 工具结果若以 `[权限不足]` / `[用户授权失效]` / `[需要用户授权]` / `[需要确认]` / `[dry-run 预览]` 开头，说明这件事你自己做不了、必须由用户先操作（开通 scope / 重新授权 / 回复确认高危操作）。此时把这条工具结果原文（含其中的链接、操作步骤）作为最终答复转达给用户，**本回合绝不要再用相同参数重试同一命令**，等用户回复后再继续。绝不要把它当普通失败而“我再试一次”。',
    '- 在本回合内把用户的请求做完：连续调用工具直到拿到完整结果，再给出最终答复，不要中途停下等用户追问（上一条终端状态除外）。',
    '- 需要先告诉用户“我查一下/稍等”时，可以在调用工具的同时附上这句话（它会被立刻发给用户），但你必须紧接着调用工具、查完后把完整结果作为最终答复再发一次。绝不允许说“我再去查一下”然后就没有下文。',
    '- 最终答复必须是完整的结果，不能包含未兑现的“我接下来会去查/去做”之类的承诺。',
    '- 如果缺少合适的工具无法完成某一步，要如实说明做不到，并把已经查到的部分结果告诉用户，而不是假装接下来会做。',
    '- **只能调用系统提供的工具。如果用户的请求没有对应工具能完成，直接说明做不到（并给出已能做的替代），不要编造工具名或参数，不要用特殊标记格式（如 DSML、<｜｜DSML｜｜tool_calls> 等标签）输出伪调用。**'
  ].join('\n');
}

// Appended ONLY to scheduler-triggered runs. The scheduler delivers the agent's
// final reply to target_chat_id via its own bot channel, so the agent's job is
// to SAY the content — not to send an IM, and never as the user (triggered runs
// are bot-only). Without this, a stored prompt like "请发消息给他" makes the
// fired agent try `im +send --as user` and fail on the no-user-auth short-circuit.
function buildTriggeredRunContext(targetChatId?: string | null): string {
  const delivery = targetChatId
    ? `- 你的最终回复会被系统自动以 bot 身份发送到会话 ${targetChatId}。`
    : '- 本次未配置目标会话，你的回复不会被自动发送。';
  return [
    '',
    '',
    '## 当前运行模式：定时触发',
    '- 你现在是被定时任务触发运行的，不是用户正在和你对话。',
    delivery,
    '- 因此：把要传达的内容**直接作为最终回复输出即可**，不要自己去调用 `im +send` 之类的发消息命令。',
    '- 本场景以 bot 身份代发，**不要使用 `--as user`**（定时触发不带用户身份，也无必要）。',
    '- 若这件事必须以用户身份才能完成（如查某人的用户日程、发用户邮件），直接在回复里说明“需要你在对话里让我做”，不要硬试。'
  ].join('\n');
}

export interface BuildSystemPromptOptions {
  /** When set, a triggered-run context block is appended (tells the model its
   *  reply is auto-delivered as bot — don't call im send, don't use --as user). */
  triggeredRun?: { targetChatId?: string | null };
}

/** Assemble the full system prompt shared by the message path and the scheduler.
 *  `exec` is injected through to buildLarkGuide for tests (so tests don't shell
 *  out to the real lark-cli binary). */
export async function buildSystemPrompt(
  systemPrompt: string,
  opts?: BuildSystemPromptOptions,
  exec?: ExecFn
): Promise<string> {
  const larkGuide = await buildLarkGuide(exec);
  let prompt = systemPrompt + larkGuide + buildCurrentTimeContext() + buildToolDiscipline();
  if (opts?.triggeredRun) {
    prompt += buildTriggeredRunContext(opts.triggeredRun.targetChatId);
  }
  return prompt;
}
