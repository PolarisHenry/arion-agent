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

// Format a Date in the configured tz as { date: '2026-08-10', weekday: '周一' }.
function tzParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).formatToParts(date);
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
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: wdMap[get('weekday')] ?? get('weekday')
  };
}

// Build a "current time" context block, appended to the system prompt. The
// model is told the real today (not its training cutoff) for relative-time
// requests. We PRE-COMPUTE today / tomorrow / day-after / yesterday so the
// model doesn't have to do date arithmetic itself — that step is exactly where
// weak models (e.g. DeepSeek Flash) anchor on a stale date from conversation
// history instead of the injected time. Stating "明天 = 2026-08-11" removes
// the arithmetic and the anchoring in one shot. Placed at the END of the
// system prompt so it's the last thing the model reads before the history.
function buildCurrentTimeContext(): string {
  const tz = config.agentTimezone;
  const now = new Date();
  const today = tzParts(now, tz);
  const tomorrow = tzParts(new Date(now.getTime() + 86_400_000), tz);
  const dayAfter = tzParts(new Date(now.getTime() + 2 * 86_400_000), tz);
  const yesterday = tzParts(new Date(now.getTime() - 86_400_000), tz);
  // Clock stamp (for "现在几点" style requests).
  const clockParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const hour =
    (clockParts.find((p) => p.type === 'hour')?.value ?? '0') === '24'
      ? '00'
      : (clockParts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = clockParts.find((p) => p.type === 'minute')?.value ?? '0';
  return [
    '',
    '## 当前时间（日期锚点 — 以此为准，不要用对话历史里的旧日期）',
    `当前时间：${today.date} ${today.weekday} ${hour}:${minute}（${tz}）`,
    '',
    '⚠️ 用户说"今天 / 明天 / 后天 / 昨天 / 本周 / 下周 / X 号"时，必须用下面这些日期，绝不要用对话历史里出现过的旧日期，也绝不要自己推算：',
    `- 今天 = ${today.date}（${today.weekday}）`,
    `- 明天 = ${tomorrow.date}（${tomorrow.weekday}）`,
    `- 后天 = ${dayAfter.date}（${dayAfter.weekday}）`,
    `- 昨天 = ${yesterday.date}（${yesterday.weekday}）`,
    '',
    `例：当前是 ${today.date}，用户说"明天的提醒" → 日期填 ${tomorrow.date}，不是历史里出现过的任何其他日期。`
  ].join('\n');
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
    '- 在本回合内把用户的请求做完：连续调用工具直到拿到完整结果，再给出最终答复，不要中途停下等用户追问（上一条终端状态除外；请求本身信息不足时，按下面「信息不足时先问清楚再动手」处理，不算违规停下）。',
    '- **信息不足时先问清楚再动手（重要）。** 若用户的请求缺少决定性参数——也就是你必须编一个会实质改变结果的值才能继续（建提醒/日程没给时间；“搬/复制/移动/发”没给源或目标；没说对象是谁）——**不要猜参数硬做，也不要假装“我先去做”**。直接抛出一个**具体的**澄清问题：列清楚你缺哪几项、给几个选项让用户选，然后**本回合到此停下等用户回复**，下一轮拿到信息再执行。清晰的请求（如“明天9点提醒我开会”）不要画蛇添足地确认，直接做。',
    '- 需要先告诉用户“我查一下/稍等”时，可以在调用工具的同时附上这句话（它会被立刻发给用户），但你必须紧接着调用工具、查完后把完整结果作为最终答复再发一次。绝不允许说“我再去查一下”然后就没有下文。',
    '- 最终答复必须是完整的结果，不能包含未兑现的“我接下来会去查/去做”之类的承诺。',
    '- 如果缺少合适的工具无法完成某一步，要如实说明做不到，并把已经查到的部分结果告诉用户，而不是假装接下来会做。',
    '- **只能调用系统提供的工具。如果用户的请求没有对应工具能完成，直接说明做不到（并给出已能做的替代），不要编造工具名或参数，不要用特殊标记格式（如 DSML、<｜｜DSML｜｜tool_calls> 等标签）输出伪调用。**',
    '- **主动记可复用的稳定信息——但只记“以后还会用到”的。** 用户给出会反复用到的稳定信息（资源位置/ID/token、常用联系人、固定规则偏好如“老板娘的账记到哪张表”“我周报每周五交”），调 `memory` save 记下来，下次别再问。**不要记一次性的或仅本次有效的信息**：一次性的提醒动作（“明早提醒我开会”——那是提醒、不是记忆，建日程/提醒即可）、本轮对话的临时上下文、随时会变的瞬时状态（某个开关此刻 on/off）——这些存了就是垃圾，还挤占你的注意力。',
    '- **保持记忆准确，并严格按 key 操作。** key 必须是小写点分 snake_case/kebab-case 机器键（只允许 a-z 0-9 _ - .），如 `accounting.spreadsheet_token`、`workflow.sync`——禁止用中文句子或带标点的描述当 key（跨回合复现不了、save 会被拒、delete 也对不上）。`memory list` 每行方括号后、冒号前的就是真 key；要 update/delete 必须照抄那个 key（不是后面的中文标签）：更新用 `memory save` 同 key 覆盖（别另起新 key 留重复项），作废用 `memory delete`。同一件事只保留一个 key，发现重复立即删多余的。有时效的信息（当前 sprint、临时事务）存时设 expiresAt，到期系统自动忽略。'
  ].join('\n');
}

// Skill usage rules — always present (create/load are always available to the
// agent). Tells the model: arion skills use the `skill` tool, load on demand,
// may proactively precipitate recurring flows (with consent), and must confirm
// after precipitating. Platform builtins are load-only.
function buildSkillRules(): string {
  return [
    '',
    '',
    '## 技能（skill 工具）使用准则',
    '- 上面的「技能」段（如有）列出你当前可用的 skill。判断某次请求与某条相关时，先调 skill({action:"load", name:"…"}) 读正文，再按正文执行——别凭名字猜内容。',
    '- arion 自有技能用 skill 工具；飞书域技能（lark- 开头）仍用 read_skill。两者别混。',
    '- 完成一个非平凡、很可能复现的多步操作后，你可以主动问用户"要把这套流程存成技能吗？"——经用户同意后调 skill({action:"create", name, description, body}) 沉淀。description 写清"什么情况下该用它"（这是以后能否被正确唤起的关键），body 写步骤、不写敏感数据。克制提议，别频繁打扰。',
    '- 用户主动让你"记住这个流程 / 存成技能"时，直接 create；沉淀后必须向用户确认（"✅ 已存为技能 X，以后说 Y 我就走这套"）。',
    '- skill 的 create/update 只作用于你自己的私有技能；平台内置技能只能 load。删除 / 停用你自己做不了，请让用户去 dashboard 处理。'
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
    '- 若这件事必须以用户身份才能完成（如查某人的用户日程、发用户邮件），直接在回复里说明“需要你在对话里让我做”，不要硬试。',
    '- 此模式下**不要抛澄清问题**（定时触发没有用户在线回答）。缺参数时尽力用合理默认执行，并在回复里说明你假设了什么、还缺什么，不要停下等待。'
  ].join('\n');
}

export interface BuildSystemPromptOptions {
  /** When set, a triggered-run context block is appended (tells the model its
   *  reply is auto-delivered as bot — don't call im send, don't use --as user). */
  triggeredRun?: { targetChatId?: string | null };
  /** Pre-rendered long-term memory section (from renderMemorySection).
   *  Empty/undefined → omitted. Caller fetches + renders so this fn stays
   *  DB-free and testable. */
  memorySection?: string;
  /** Pre-rendered skill index section (from loadSkillIndex). Empty/undefined
   *  → omitted. Caller fetches + renders so this fn stays DB-free, mirroring
   *  memorySection. */
  skillSection?: string;
  /** When false, skip the lark-cli skill guide. Defaults to true so callers
   *  that don't pass it keep the old behaviour. WeChat agents with no Feishu
   *  link pass false — they can't use lark-cli tools, so the guide is noise. */
  feishuLinked?: boolean;
}

/** Assemble the full system prompt shared by the message path and the scheduler.
 *  `exec` is injected through to buildLarkGuide for tests (so tests don't shell
 *  out to the real lark-cli binary). */
export async function buildSystemPrompt(
  systemPrompt: string,
  opts?: BuildSystemPromptOptions,
  exec?: ExecFn
): Promise<string> {
  const feishuLinked = opts?.feishuLinked !== false; // default true
  const larkGuide = feishuLinked ? await buildLarkGuide(exec) : '';
  let prompt = systemPrompt + larkGuide + buildToolDiscipline() + buildSkillRules();
  if (opts?.skillSection) {
    prompt += opts.skillSection;
  }
  if (opts?.memorySection) {
    prompt += opts.memorySection;
  }
  if (opts?.triggeredRun) {
    prompt += buildTriggeredRunContext(opts.triggeredRun.targetChatId);
  }
  // Time anchor LAST — closest to the conversation history, so it's the freshest
  // date signal when the model resolves "今天/明天" in the latest user message.
  // Weak models (DeepSeek Flash) anchor on stale history dates if this is buried
  // mid-prompt; placing it at the end + pre-computing relatives counters that.
  prompt += buildCurrentTimeContext();
  return prompt;
}
