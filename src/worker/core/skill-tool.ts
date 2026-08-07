// ============================================================
// skill tool — arion-owned skills (no lark-cli). action-based,
// mirrors the memory tool's shape. Scopes all ops to ctx.agentId.
// load/create/update implemented; create/update source `precipitated`
// skills into the agent-private DB (chatId for traceability). No
// delete — that's a dashboard-only action.
// ============================================================

import { createLogger } from './logger';
import { findSkillForAgent, saveAgentSkill, updateAgentSkill } from './skill-source';
import type { LlmTool } from './llm';
import type { AgentTool, ToolContext } from './tools';

const log = createLogger('skill-tool');

const schema: LlmTool = {
  type: 'function',
  function: {
    name: 'skill',
    description:
      'skill: 读写本智能体自己的技能（arion 自有，非飞书域）。action=load/create/update。\n' +
      'load(name) 读某条技能的正文步骤书——判断当前请求与「技能」索引里某条相关时先 load 再按它执行。\n' +
      'create(name, description, body) 把一套反复出现的流程沉淀为技能（经用户同意）。\n' +
      'update(name, description?, body?) 改你自己技能的 description/body（不能改名）。\n' +
      '没有 delete——删除/停用让用户去 dashboard。平台内置技能只能 load。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['load', 'create', 'update'],
          description: 'load/create/update'
        },
        name: {
          type: 'string',
          description: '技能名（load/create/update 都要；load 传索引里的原名字）'
        },
        description: {
          type: 'string',
          description: 'create/update: 触发线索，什么情况下该用这条技能'
        },
        body: { type: 'string', description: 'create/update: markdown 步骤书正文' }
      },
      required: ['action', 'name']
    }
  }
};

async function executeSkillTool(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const agentId = ctx.agentId;
  const ownerId = ctx.ownerId;
  if (!agentId || !ownerId) {
    return '[skill] missing agent context (agentId/ownerId) — cannot manage skills here';
  }
  const action = String(args.action ?? '');
  const name = String(args.name ?? '').trim();
  if (!name) return '[skill] action requires "name"';

  try {
    if (action === 'load') {
      const skill = await findSkillForAgent(agentId, ownerId, name);
      if (!skill) {
        return `[skill] 未找到技能 ${name}（用索引里的原名字；注意 arion 技能用 skill，飞书域用 read_skill）`;
      }
      return skill.body || `（技能 ${name} 正文为空）`;
    }

    if (action === 'create') {
      const description = String(args.description ?? '').trim();
      const body = String(args.body ?? '').trim();
      if (!description) return '[skill] create requires "description"';
      if (!body) return '[skill] create requires "body"';
      const res = await saveAgentSkill({
        agentId,
        ownerId,
        name,
        description,
        body,
        provenance: 'precipitated',
        sourceChatId: ctx.chatId
      });
      if (!res.ok) return `[skill] ${res.error}`;
      return `✅ 已保存为技能「${name}」。以后类似请求我会先 load 它再按步骤执行。请向用户确认（"已存为技能 ${name}，以后说相关的话我就走这套"）。`;
    }

    if (action === 'update') {
      const res = await updateAgentSkill(agentId, name, {
        description: args.description !== undefined ? String(args.description) : undefined,
        body: args.body !== undefined ? String(args.body) : undefined
      });
      if (!res.ok) return `[skill] ${res.error}`;
      return `✅ 已更新技能「${name}」。`;
    }

    return `[skill] unknown action: ${action}. Use load/create/update.`;
  } catch (err: any) {
    log.error(`skill tool error: ${err?.message ?? err}`);
    return `[skill] error: ${err?.message ?? err}`;
  }
}

/** No `requires` — skills are platform-agnostic; every agent gets the skill
 *  tool (load/create/update work for both lark and wechat agents). */
export const skillTool: AgentTool = { schema, execute: executeSkillTool };
