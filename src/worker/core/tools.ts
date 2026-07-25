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
        '读取某个飞书域的 SKILL.md 用法说明（离线、安全）。用到某域的深度用法（多步流程、身份要求、常见坑）时先调它。传入 domain，例如 lark-calendar / lark-doc / lark-im。',
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'skill 域名，如 lark-calendar' }
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
        'manage_schedule: 管理本智能体的定时触发任务(非 lark-cli)。action=create/list/delete/update。\n' +
        'create 需要 name(人类可读标签) + cron(5字段标准 cron: 分 时 日 月 周) + prompt(到点要做什么)。\n' +
        'cron 按 agent 时区计算; 系统提示里已给出当前时间, 用它把"今天/明天/本周三"换算成具体日期。\n' +
        '\n' +
        '⚠️ 一次性 vs 重复 —— 最易出错, 务必分清:\n' +
        '- 默认一次性: 用户只给时间、没说"每天/每周/工作日/每隔/定期", 就是一次性提醒 → cron 的"日""月"必须填那一天的【具体日期】, 不能用 *。例: 今天 7/23 的 9 点 = "0 9 23 7 *"; 明天 7/24 的 9 点 = "0 9 24 7 *"。\n' +
        '- 只有用户明确说"每天/每周/工作日/每隔N/每月/每年"才是重复 → 用通配 *。例: "0 9 * * *" 每天9点; "0 9 * * 1-5" 工作日9点; "0 9 * * 1" 每周一9点; "0 * * * *" 每小时; "*/5 * * * *" 每5分钟。\n' +
        '- "9点提醒我" = 今天9点(若现在已过9点则先确认是否改明天), 绝不是"每天9点"。把单次时间擅自升级成每天, 是本工具最常见的严重错误。\n' +
        '- 时间已过或指代不明(如"下周"但当前日期不清)时, 先向用户确认, 不要瞎猜。\n' +
        '\n' +
        '⚠️ 提醒 vs 飞书日程 —— 别混:\n' +
        '- 本工具是【agent 定时提醒】: 到点由我主动发一句话/做件事, 不进飞书日历。适合"提醒我/别忘了/到点叫我/定时催/每天提醒"。\n' +
        '- 飞书【日程】= 日历事件(走 run_lark_cli 的 calendar +create), 出现在飞书日历里、由飞书按日程时间通知。适合"开会/约会/预约/排期/约XX/加个日程"。\n' +
        '- 例: "明天3点提醒我开会" → 本工具(到点我提醒你); "明天3点约个会/加个日程" → calendar +create。两者可并存(既建日程又加提醒), 但别用错工具。\n' +
        '\n' +
        'target_chat_id 可选(不传则默认当前会话, 到点把回复发到那)。\n' +
        '重要: prompt 直接写"到点要说的内容"本身(如"提醒: 检查露营模式关了没"), 不要写成"请发消息给某人"——到点触发时系统会自动把你的最终回复以 bot 身份发到 target_chat_id, 你直接把内容说出来即可。\n' +
        '只在用户明确要求"定时/提醒/每天/每周"时创建; 不要只说"我会提醒你"却不实际创建任务。\n' +
        'workdays_only=true 表示"仅工作日"语义: 跳过中国法定节假日、调休补班日照常触发(详见该参数)。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'delete', 'update'],
            description: 'create/list/delete/update a scheduled task'
          },
          name: { type: 'string', description: 'create/update: 人类可读标签' },
          cron: { type: 'string', description: '5字段标准 cron: 分 时 日 月 周' },
          prompt: { type: 'string', description: 'create: 触发时执行的内容' },
          trigger_id: { type: 'string', description: 'delete/update: 任务 id（来自 list）' },
          target_chat_id: { type: 'string', description: 'create: 结果发到哪个会话（可选）' },
          enabled: { type: 'boolean', description: 'update: 启用/停用' },
          workdays_only: {
            type: 'boolean',
            description:
              'create/update: 仅工作日触发(跳过中国法定节假日、调休补班照常)。true 时系统把 cron 当每天调度、再判断今天是否中国工作日。用户说“工作日提醒/跳过节假日”设 true; 说“每天/每周一”等明确周期通常 false。'
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
          key: { type: 'string', description: '稳定机器键，如 accounting.spreadsheet_token' },
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

/** The fixed LLM-visible tool set: 3 generic lark-cli tools + manage_schedule + memory.
 *  No per-agent enable list — every agent can drive every domain; missing
 *  permissions are surfaced reactively. */
export function getTools(): LlmTool[] {
  return TOOL_DEFS;
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
  if (toolName === 'read_skill') return readSkill(String(args.domain ?? ''), ctx);
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
      const cronExpr = String(args.cron ?? '').trim();
      const prompt = String(args.prompt ?? '').trim();
      if (!name) return '[schedule] create requires "name"';
      if (!cronExpr)
        return '[schedule] create requires "cron" (5-field: min hour day month weekday)';
      if (!cron.validate(cronExpr))
        return `[schedule] invalid cron expression: "${cronExpr}". Use 5-field standard cron (min hour day month weekday).`;
      if (!prompt) return '[schedule] create requires "prompt" (what to do when it fires)';
      const targetChatId = args.target_chat_id
        ? String(args.target_chat_id).trim()
        : (ctx.chatId ?? null);
      const id = randomUUID();
      await workerDb.insert(agentSchema.agentTrigger).values({
        id,
        ownerId,
        agentId,
        name,
        cron: cronExpr,
        prompt,
        targetChatId: targetChatId || null,
        enabled: true,
        workdaysOnly: args.workdays_only === true
      });
      const where = targetChatId
        ? ` (result will be sent to ${targetChatId})`
        : ' (no target chat — runs without sending)';
      return `✅ 已创建定时任务：「${name}」(${cronExpr})${where}。将在 cron 时间自动执行。`;
    }

    if (action === 'list') {
      const rows = await workerDb
        .select()
        .from(agentSchema.agentTrigger)
        .where(eq(agentSchema.agentTrigger.agentId, agentId));
      if (rows.length === 0) return '当前没有定时任务。';
      return rows
        .map(
          (r) =>
            `- id=${r.id} 名称="${r.name}" cron=${r.cron} 启用=${r.enabled}${r.targetChatId ? ` →${r.targetChatId}` : ''} 上次执行=${r.lastRunAt?.toISOString() ?? '从未'}\n  prompt: ${r.prompt}`
        )
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
      if (args.cron !== undefined) {
        const c = String(args.cron);
        if (!cron.validate(c))
          return `[schedule] invalid cron expression: "${c}". Use 5-field standard cron.`;
        updates.cron = c;
      }
      if (args.prompt !== undefined) updates.prompt = String(args.prompt);
      if (args.target_chat_id !== undefined) {
        updates.targetChatId = String(args.target_chat_id).trim() || null;
      }
      if (args.enabled !== undefined) updates.enabled = !!args.enabled;
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
        .map((f) => `- [${f.category ?? '-'}] ${f.label ?? f.key}: ${f.value.slice(0, 80)}`)
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
