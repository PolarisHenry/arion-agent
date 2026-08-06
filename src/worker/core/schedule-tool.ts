// ============================================================
// manage_schedule tool — internal (no lark-cli). Creates/lists/
// updates/deletes scheduled triggers in agent_trigger. The
// Scheduler's hot-reload picks up changes within ~10s. All ops
// are scoped to ctx.agentId — an agent can only manage its own
// triggers.
//
// Extracted from tools.ts as part of the tool-registry refactor:
// one tool = one file (schema + executor co-located). The schema
// text and executeScheduleTool body are verbatim from the former
// tools.ts — no behavior change.
// ============================================================

import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { eq, and } from 'drizzle-orm';
import { createLogger } from './logger';
import { workerDb, agentSchema } from '../worker-db';
import type { LlmTool } from './llm';
import type { AgentTool, ToolContext } from './tools';

const log = createLogger('schedule-tool');

/** The LLM-visible schema. Verbatim from the former TOOL_DEFS entry. */
const schema: LlmTool = {
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
};

/** manage_schedule — internal (no lark-cli). Creates/lists/deletes/updates
 *  scheduled triggers in agent_trigger. The Scheduler's hot-reload picks up
 *  changes within ~10s. All ops are scoped to ctx.agentId. */
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

/** No `requires` — manage_schedule is platform-agnostic (no lark-cli), so every
 *  agent gets it, including unlinked WeChat agents. */
export const scheduleTool: AgentTool = {
  schema,
  execute: executeScheduleTool
};
