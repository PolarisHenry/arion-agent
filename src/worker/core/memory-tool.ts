// ============================================================
// memory tool — internal (no lark-cli). save/get/list/delete on
// agent_memory, scoped to ctx.agentId.
//
// Extracted from tools.ts as part of the tool-registry refactor:
// one tool = one file (schema + executor co-located). The schema
// text and executeMemoryTool body are verbatim from the former
// tools.ts — no behavior change.
// ============================================================

import { createLogger } from './logger';
import { saveMemoryFact, getMemoryFact, listMemoryFacts, deleteMemoryFact } from './agent-memory';
import type { LlmTool } from './llm';
import type { AgentTool, ToolContext } from './tools';

const log = createLogger('memory-tool');

/** The LLM-visible schema. Verbatim from the former TOOL_DEFS entry. */
const schema: LlmTool = {
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
};

/** memory — internal (no lark-cli). save/get/list/delete on agent_memory,
 *  scoped to ctx.agentId. */
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

/** No `requires` — memory is platform-agnostic (no lark-cli), so every agent
 *  gets it, including unlinked WeChat agents. */
export const memoryTool: AgentTool = {
  schema,
  execute: executeMemoryTool
};
