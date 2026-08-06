// ============================================================
// LLM tool surface — 3 generic lark-cli tools + manage_schedule + memory.
// read_skill / schema / run_lark_cli dispatch to ./lark-executor,
// which owns the lark-cli subprocess + error-envelope handling.
// manage_schedule and memory are internal (no lark-cli) and are handled here.
// ============================================================

import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { eq, and } from 'drizzle-orm';
import { createLogger } from './logger';
import { workerDb, agentSchema } from '../worker-db';
import type { LlmTool } from './llm';
import { runLarkCli, readSkill, larkSchema } from './lark-executor';
import { saveMemoryFact, getMemoryFact, listMemoryFacts, deleteMemoryFact } from './agent-memory';

const log = createLogger('tools');

// -----------------------------------------------------------
// Tool definitions (LLM-visible function schemas)
// The fixed set every agent gets: 3 generic lark-cli tools +
// manage_schedule. No per-agent enable list — every agent can
// drive every domain; missing permissions are surfaced reactively.
// -----------------------------------------------------------

const TOOL_DEFS: LlmTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description:
        '读取某个飞书域的 SKILL.md 用法说明（离线、安全）。用到某域的深度用法（多步流程、身份要求、常见坑）时先调它。传入 domain，例如 lark-calendar / lark-doc / lark-im。SKILL.md 是一张路由表，里面出现的 references/xxx.md 链接（如公式字段 guide、lookup guide、角色配置）是深度细节的来源——遇到这类链接时用 path 参数读对应文件，不要凭猜测拼字段结构。',
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'skill 域名，如 lark-calendar' },
          path: {
            type: 'string',
            description:
              '可选：skill 下某个 reference 文件的相对路径，如 references/formula-field-guide.md。SKILL.md 里出现 references/xxx.md 链接且你需要其细节时传入；不传则返回主 SKILL.md。'
          }
        },
        required: ['domain']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schema',
      description:
        '查询某个 lark-cli 方法的参数/类型/枚举/scope（离线、安全）。不确定参数时先查再调。method 形如 service.resource.method，例如 calendar.events.create。',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: '如 calendar.events.create' }
        },
        required: ['method']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_lark_cli',
      description:
        '执行一条 lark-cli 命令。argv 是参数数组，形如 ["calendar","+create","--as","user","--summary","周会","--start","2026-07-22T15:00:00+08:00"]。高危命令会先自动 dry-run 预览，确认后带 --yes 重调。身份：用户数据用 --as user，bot 自身资源用 --as bot。',
      parameters: {
        type: 'object',
        properties: {
          argv: {
            type: 'array',
            items: { type: 'string' },
            description: 'lark-cli 参数数组（不含二进制名和 --profile）'
          }
        },
        required: ['argv']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_schedule',
      description:
        'manage_schedule: 管理本智能体的定时任务(非 lark-cli)。action=create/list/delete/update。\n' +
        '\n' +
        '两类任务(创建时用 kind 选):\n' +
        '- kind=reminder(定时提醒): 到点把一段【固定文案】发给目标对象, 不跑 LLM、不调工具, 纯粹"到点喊一嗓子"。适合"提醒我/别忘了/到点叫我/定时催"。必填 message(到点要发的原文)。\n' +
        '- kind=task(定时任务): 到点跑一次 agent turn 执行操作(可调工具、生成内容、记账、出文档), 结果可选地发到目标对象。必填 prompt(到点喂给 agent 的指令)。\n' +
        '  · 判定: 用户说"提醒/到点叫我/别忘了/催一下" → reminder; 说"每天生成/定时做XX/算一下/出个报告/整理" → task。拿不准就 task。\n' +
        '\n' +
        '调度时间(二选一, 必须给一个):\n' +
        '- 一次性 → 传 fire_at(ISO-8601 带时区, 如 2026-07-23T09:00:00+08:00)。到点发一次, 自动转"已完成", 不再重复。用户只给一个时间、没说"每天/每周/定期" → 就是一次性, 用 fire_at。\n' +
        '- 重复 → 传 cron(5字段标准 cron: 分 时 日 月 周)。只有用户明确说"每天/每周/工作日/每隔N/每月/每年"才用。例: "0 9 * * *" 每天9点; "0 9 * * 1-5" 工作日9点; "0 9 * * 1" 每周一。\n' +
        '  · cron 按 agent 时区算; 系统提示已给当前时间, 用它换算"今天/明天/本周三"。但一次性请直接用 fire_at, 别把日期塞进 cron。\n' +
        '  · "9点提醒我" = 今天9点(若已过9点则先确认是否改明天), 不是"每天9点"。时间已过或指代不明时先问用户, 别瞎猜。\n' +
        '\n' +
        'target_chat_id 可选(不传则默认当前会话)。reminder 必须有目标(否则没地方发); task 不传则只执行不发结果。\n' +
        'reminder 的 message 直接写"到点要说的原文"(如"提醒: 关掉露营模式"); task 的 prompt 写"到点做什么"(如"把今天的支出记到账上")。\n' +
        '\n' +
        '⚠️ 定时提醒 vs 飞书日程 —— 别混:\n' +
        '- 本工具 = agent 到点主动发话/做事, 不进飞书日历。适合"提醒/到点/定时/每天"。\n' +
        '- 飞书【日程】= 日历事件(走 run_lark_cli 的 calendar +create), 出现在飞书日历里、由飞书按时间通知。适合"开会/约会/预约/排期/约XX/加个日程"。\n' +
        '- 例: "明天3点提醒我开会" → 本工具(reminder); "明天3点约个会/加个日程" → calendar +create。两者可并存。\n' +
        '\n' +
        '只在用户明确要求"定时/提醒/每天/每周/到点"时创建; 别只说"我会提醒你"却不创建。' +
        'workdays_only=true(仅重复任务)表示"仅工作日": 跳过中国法定节假日、调休补班照常触发。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'delete', 'update'],
            description: 'create/list/delete/update a scheduled task'
          },
          kind: {
            type: 'string',
            enum: ['reminder', 'task'],
            description:
              'create/update: reminder=到点发固定文案(不跑LLM); task=到点跑agent执行操作。默认 task。'
          },
          name: { type: 'string', description: 'create/update: 人类可读标签' },
          cron: { type: 'string', description: '重复: 5字段标准 cron (分 时 日 月 周)' },
          fire_at: {
            type: 'string',
            description: '一次性: ISO-8601 带时区(如 2026-07-23T09:00:00+08:00), 到点发一次后完成'
          },
          prompt: { type: 'string', description: 'task: 到点喂给 agent 的指令' },
          message: { type: 'string', description: 'reminder: 到点要发的固定原文' },
          trigger_id: { type: 'string', description: 'delete/update: 任务 id（来自 list）' },
          target_chat_id: { type: 'string', description: '可选; 不传默认当前会话' },
          enabled: { type: 'boolean', description: 'update: 启用/停用' },
          workdays_only: {
            type: 'boolean',
            description:
              'create/update(仅重复任务): 仅工作日触发(跳过中国法定节假日、调休补班照常)。用户说"工作日/跳过节假日"设 true。'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory',
      description:
        'memory: 读写本智能体的长期记忆（/clear 也不会丢）。action=save/get/list/delete。\n' +
        'save(key,value,label?,category?,note?,importance?,expiresAt?) 记一条可复用的稳定信息（资源位置/ID、偏好、常用对象），同 key 覆盖、value ≤ 4096 字符。\n' +
        'get(key) 取一条。list(category?) 列出。delete(key) 删一条。\n' +
        'importance 可选 high/medium/low（默认 medium），高重要性在截断时优先保留。\n' +
        'expiresAt 可选 ISO-8601 时间戳，到时自动过期不注入（如当前 sprint 周几结束、临时事件等有时效的信息）。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['save', 'get', 'list', 'delete'],
            description: 'save/get/list/delete'
          },
          key: {
            type: 'string',
            description:
              '稳定机器键：小写 snake_case/kebab-case，可点分命名空间，只允许 a-z 0-9 _ - .（如 accounting.spreadsheet_token、workflow.sync）。禁止中文/空格/标点。delete/get 必须用 list 里看到的原 key，不是后面的中文标签。'
          },
          value: { type: 'string', description: 'save: 事实值（≤4096 字符）' },
          label: { type: 'string', description: 'save: 人类可读标签' },
          category: {
            type: 'string',
            description: 'save/list: 分组，如 resource/preference/contact'
          },
          note: { type: 'string', description: 'save: 附加上下文' },
          importance: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'save: 重要程度（默认 medium）。高优先级的在截断时优先注入。'
          },
          expiresAt: {
            type: 'string',
            description:
              'save: ISO-8601 过期时间。有时效的信息用（如 2026-08-01T00:00:00+08:00），到时自动忽略。'
          }
        },
        required: ['action']
      }
    }
  }
];

// -----------------------------------------------------------
// Public API
// -----------------------------------------------------------

/** Tools that dispatch to lark-cli (Feishu). Excluded when the agent has no
 *  Feishu operational identity — i.e. an unlinked WeChat agent. A Lark agent,
 *  or a WeChat agent linked to one, passes feishuLinked=true. manage_schedule
 *  + memory are internal (no lark-cli) and always available. */
const LARK_ONLY_TOOLS = new Set(['read_skill', 'schema', 'run_lark_cli']);

/** The LLM-visible tool set. feishuLinked=true → all tools (agent can drive
 *  Feishu via lark-cli); false → only the platform-agnostic subset
 *  (manage_schedule, memory). Defaults to true so no-arg callers keep all. */
export function getTools(feishuLinked: boolean = true): LlmTool[] {
  if (feishuLinked) return TOOL_DEFS;
  return TOOL_DEFS.filter((t) => !LARK_ONLY_TOOLS.has(t.function.name));
}

/** run_lark_cli requires user identity iff the LLM passed --as user (tracking
 *  the LAST --as value across both `--as X` and `--as=X` forms — cobra keeps
 *  the last). The other tools (read_skill/schema) are offline and never need
 *  identity. */
export function isUserRequired(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName !== 'run_lark_cli') return false;
  const argv = Array.isArray(args.argv) ? (args.argv as unknown[]) : [];
  let asVal = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--as' && typeof argv[i + 1] === 'string') {
      asVal = argv[i + 1] as string;
      i++;
    } else if (typeof a === 'string' && a.startsWith('--as=')) {
      asVal = a.slice('--as='.length);
    }
  }
  return asVal === 'user';
}

export type AuthHooks = {
  /** Called when a user-identity call returns missing_scope. Kicks off an
   *  incremental device flow + records the failed call for replay. Returns
   *  the verification URL the user must open, or null if unavailable. */
  onMissingUserScope: (
    agentId: string,
    ownerId: string,
    scopes: string[],
    chatId: string | undefined,
    failedArgv: string[]
  ) => Promise<{ verificationUrl: string } | null>;
};

export type ToolContext = {
  profile: string;
  appId: string;
  /** When true, execute commands as the user (--as user) instead of bot (--as bot).
   *  Set by agent-runtime based on whether the agent has completed user OAuth. */
  asUser?: boolean;
  /** When true, the tool requires user identity. If asUser is false and this is true,
   *  executeTool short-circuits with a "needs authorization" message. */
  userOnly?: boolean;
  /** Agent identity + chat context for INTERNAL tools (e.g. manage_schedule) that
   *  don't call lark-cli. Optional — lark-cli tools ignore these. */
  agentId?: string;
  ownerId?: string;
  chatId?: string;
  /** Reactive incremental-auth hook (user-identity missing_scope). Optional —
   *  when absent, user missing_scope falls back to the legacy scope-apply hint. */
  authHooks?: AuthHooks;
};

/**
 * Execute a tool call. The 3 generic lark-cli tools dispatch to ./lark-executor
 * (which owns the subprocess + error-envelope handling); manage_schedule is
 * handled internally by executeScheduleTool. Reactive auth: run_lark_cli with
 * --as user short-circuits when the agent has no user identity.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  // Reactive auth: run_lark_cli with --as user needs the agent's user identity.
  const userRequired = isUserRequired(toolName, args);
  if (userRequired && !ctx.asUser) {
    return [
      `[需要用户授权] ${toolName} 要以用户身份操作，但本智能体还未授权用户身份。`,
      `请把以上转达给用户：需要到 dashboard → 该智能体 →「用户身份」→ 授权；用户回复前，不要重试本命令。`
    ].join('\n');
  }

  if (toolName === 'manage_schedule') return executeScheduleTool(args, ctx);
  if (toolName === 'memory') return executeMemoryTool(args, ctx);
  if (toolName === 'read_skill') {
    const skillPath = args.path ? String(args.path) : undefined;
    return readSkill(String(args.domain ?? ''), ctx, undefined, skillPath);
  }
  if (toolName === 'schema') return larkSchema(String(args.method ?? ''), ctx);
  if (toolName === 'run_lark_cli') {
    const argv = Array.isArray(args.argv) ? (args.argv as string[]).map(String) : [];
    return runLarkCli(argv, ctx);
  }

  log.warn(`Unknown tool: ${toolName}`);
  return `Unknown tool: ${toolName}`;
}

// -----------------------------------------------------------
// manage_schedule — internal tool (no lark-cli). Creates/lists/deletes/
// updates scheduled triggers in agent_trigger. The Scheduler's hot-reload
// picks up changes within ~10s. All ops are scoped to ctx.agentId — an
// agent can only manage its own triggers.
// -----------------------------------------------------------
async function executeScheduleTool(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const agentId = ctx.agentId;
  const ownerId = ctx.ownerId;
  if (!agentId || !ownerId) {
    return '[schedule] missing agent context (agentId/ownerId) — cannot manage triggers here';
  }

  const action = String(args.action ?? '');
  try {
    if (action === 'create') {
      const name = String(args.name ?? '').trim();
      if (!name) return '[schedule] create requires "name"';
      const kind = args.kind === 'reminder' ? 'reminder' : 'task';

      // Schedule: exactly one of cron (recurring) or fire_at (one-shot).
      const cronExpr = args.cron ? String(args.cron).trim() : '';
      const fireAtRaw = args.fire_at ? String(args.fire_at).trim() : '';
      if (!cronExpr && !fireAtRaw)
        return '[schedule] create requires either "cron" (recurring) or "fire_at" (one-shot ISO-8601)';
      if (cronExpr && fireAtRaw)
        return '[schedule] pass only one of "cron" (recurring) or "fire_at" (one-shot) — not both';
      let fireAt: Date | null = null;
      if (fireAtRaw) {
        fireAt = new Date(fireAtRaw);
        if (Number.isNaN(fireAt.getTime()))
          return `[schedule] invalid "fire_at": "${fireAtRaw}". Use ISO-8601 with timezone, e.g. 2026-07-23T09:00:00+08:00.`;
      }
      if (cronExpr && !cron.validate(cronExpr))
        return `[schedule] invalid cron expression: "${cronExpr}". Use 5-field standard cron (min hour day month weekday).`;

      const targetChatId = args.target_chat_id
        ? String(args.target_chat_id).trim()
        : (ctx.chatId ?? null);
      // workdays_only only applies to recurring triggers; a one-shot fires on
      // its chosen instant regardless of whether it's a holiday.
      const workdaysOnly = args.workdays_only === true && !!cronExpr;
      const when = fireAt ? `一次性 @ ${fireAt.toISOString()}` : `重复 ${cronExpr}`;
      const id = randomUUID();

      if (kind === 'reminder') {
        const message = String(args.message ?? '').trim();
        if (!message)
          return '[schedule] reminder create requires "message" (the text to send when it fires)';
        if (!targetChatId)
          return '[schedule] reminder create requires "target_chat_id" (or run inside a chat so it defaults to the current one)';
        await workerDb.insert(agentSchema.agentTrigger).values({
          id,
          ownerId,
          agentId,
          name,
          kind: 'reminder',
          message,
          cron: cronExpr || null,
          fireAt,
          targetChatId,
          enabled: true,
          workdaysOnly
        });
        return `✅ 已创建定时提醒：「${name}」(${when}) → ${targetChatId}。到点直接发送，不调用 LLM。`;
      }

      const prompt = String(args.prompt ?? '').trim();
      if (!prompt)
        return '[schedule] task create requires "prompt" (what the agent should do when it fires)';
      await workerDb.insert(agentSchema.agentTrigger).values({
        id,
        ownerId,
        agentId,
        name,
        kind: 'task',
        prompt,
        cron: cronExpr || null,
        fireAt,
        targetChatId: targetChatId || null,
        enabled: true,
        workdaysOnly
      });
      const where = targetChatId ? ` (结果发到 ${targetChatId})` : ' (无目标会话, 只执行不发)';
      return `✅ 已创建定时任务：「${name}」(${when})${where}。将在到点跑 agent 执行。`;
    }

    if (action === 'list') {
      const rows = await workerDb
        .select()
        .from(agentSchema.agentTrigger)
        .where(eq(agentSchema.agentTrigger.agentId, agentId));
      if (rows.length === 0) return '当前没有定时任务。';
      return rows
        .map((r) => {
          const kindLabel = r.kind === 'reminder' ? '提醒' : '任务';
          const sched = r.fireAt ? `一次性@${r.fireAt.toISOString()}` : `cron=${r.cron}`;
          const status = r.completedAt ? '已完成' : r.enabled ? '启用' : '停用';
          const body = r.kind === 'reminder' ? r.message : r.prompt;
          const field = r.kind === 'reminder' ? 'message' : 'prompt';
          return `- id=${r.id} [${kindLabel}] "${r.name}" ${sched} ${status}${r.targetChatId ? ` →${r.targetChatId}` : ''} 上次=${r.lastRunAt?.toISOString() ?? '从未'}\n  ${field}: ${body}`;
        })
        .join('\n');
    }

    if (action === 'delete') {
      const triggerId = String(args.trigger_id ?? '').trim();
      if (!triggerId) return '[schedule] delete requires "trigger_id"';
      const deleted = await workerDb
        .delete(agentSchema.agentTrigger)
        .where(
          and(
            eq(agentSchema.agentTrigger.id, triggerId),
            eq(agentSchema.agentTrigger.agentId, agentId)
          )
        )
        .returning({ id: agentSchema.agentTrigger.id });
      if (deleted.length === 0) return `[schedule] 未找到定时任务 ${triggerId}（或不属于本智能体）`;
      return `✅ 已删除定时任务 ${triggerId}。`;
    }

    if (action === 'update') {
      const triggerId = String(args.trigger_id ?? '').trim();
      if (!triggerId) return '[schedule] update requires "trigger_id"';
      const updates: Record<string, unknown> = {};
      if (args.name !== undefined) updates.name = String(args.name);
      if (args.kind !== undefined) updates.kind = args.kind === 'reminder' ? 'reminder' : 'task';
      if (args.prompt !== undefined) updates.prompt = String(args.prompt);
      if (args.message !== undefined) updates.message = String(args.message);
      if (args.target_chat_id !== undefined) {
        updates.targetChatId = String(args.target_chat_id).trim() || null;
      }
      // Schedule switch: providing a non-empty cron clears fireAt (→ recurring),
      // and vice versa, keeping the cron/fireAt mutual-exclusion invariant.
      if (args.cron !== undefined) {
        const c = String(args.cron).trim();
        if (c) {
          if (!cron.validate(c))
            return `[schedule] invalid cron expression: "${c}". Use 5-field standard cron.`;
          updates.cron = c;
          updates.fireAt = null;
        } else {
          updates.cron = null;
        }
      }
      if (args.fire_at !== undefined) {
        const f = String(args.fire_at).trim();
        if (f) {
          const d = new Date(f);
          if (Number.isNaN(d.getTime()))
            return `[schedule] invalid "fire_at": "${f}". Use ISO-8601 with timezone.`;
          updates.fireAt = d;
          updates.cron = null;
        } else {
          updates.fireAt = null;
        }
      }
      if (args.enabled !== undefined) {
        updates.enabled = !!args.enabled;
        // Re-enabling re-arms: clear "completed" so the trigger is active again.
        if (args.enabled) updates.completedAt = null;
      }
      if (args.workdays_only !== undefined) updates.workdaysOnly = args.workdays_only === true;
      if (Object.keys(updates).length === 0) return '[schedule] update: no fields to update';
      const updated = await workerDb
        .update(agentSchema.agentTrigger)
        .set(updates)
        .where(
          and(
            eq(agentSchema.agentTrigger.id, triggerId),
            eq(agentSchema.agentTrigger.agentId, agentId)
          )
        )
        .returning({ id: agentSchema.agentTrigger.id });
      if (updated.length === 0) return `[schedule] 未找到定时任务 ${triggerId}（或不属于本智能体）`;
      return `✅ 已更新定时任务 ${triggerId}。`;
    }

    return `[schedule] unknown action: ${action}. Use create/list/delete/update.`;
  } catch (err: any) {
    log.error(`manage_schedule error: ${err?.message ?? err}`);
    return `[schedule] error: ${err?.message ?? err}`;
  }
}

// -----------------------------------------------------------
// memory — internal tool (no lark-cli). save/get/list/delete on
// agent_memory, scoped to ctx.agentId. Mirrors executeScheduleTool's
// agentId guard + "[memory] error:" convention.
// -----------------------------------------------------------
async function executeMemoryTool(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const agentId = ctx.agentId;
  const ownerId = ctx.ownerId;
  if (!agentId || !ownerId) {
    return '[memory] missing agent context (agentId/ownerId) — cannot manage memory here';
  }
  const action = String(args.action ?? '');
  try {
    if (action === 'save') {
      const key = String(args.key ?? '').trim();
      const value = String(args.value ?? '');
      if (!key) return '[memory] save requires "key"';
      if (!value) return '[memory] save requires "value"';
      const res = await saveMemoryFact({
        agentId,
        ownerId,
        key,
        value,
        label: args.label ? String(args.label) : undefined,
        category: args.category ? String(args.category) : undefined,
        note: args.note ? String(args.note) : undefined,
        importance: args.importance ? String(args.importance) : undefined,
        expiresAt: args.expiresAt ? String(args.expiresAt) : undefined
      });
      if (!res.ok) return `[memory] ${res.error}`;
      return `✅ 已记住 ${args.label ? String(args.label) : key}`;
    }
    if (action === 'get') {
      const key = String(args.key ?? '').trim();
      if (!key) return '[memory] get requires "key"';
      const fact = await getMemoryFact(agentId, key);
      return fact ? `${fact.label ?? fact.key}: ${fact.value}` : `未找到 key=${key}`;
    }
    if (action === 'list') {
      const facts = await listMemoryFacts(
        agentId,
        args.category ? String(args.category) : undefined
      );
      if (facts.length === 0) return '（暂无记忆）';
      return facts
        .map((f) => {
          const label = f.label && f.label !== f.key ? `（${f.label}）` : '';
          return `- [${f.category ?? '-'}] ${f.key}${label}: ${f.value.slice(0, 80)}`;
        })
        .join('\n');
    }
    if (action === 'delete') {
      const key = String(args.key ?? '').trim();
      if (!key) return '[memory] delete requires "key"';
      const ok = await deleteMemoryFact(agentId, key);
      return ok ? `✅ 已删除 ${key}` : `未找到 key=${key}`;
    }
    return `[memory] unknown action: ${action}. Use save/get/list/delete.`;
  } catch (err: any) {
    log.error(`memory tool error: ${err?.message ?? err}`);
    return `[memory] error: ${err?.message ?? err}`;
  }
}
