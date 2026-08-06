// ============================================================
// The 3 generic lark-cli tools: read_skill / schema / run_lark_cli.
// All three dispatch to ./lark-executor (which owns the lark-cli
// subprocess + error-envelope handling) and all three are gated
// behind `requires.feishu` — an agent with no Feishu operational
// identity (an unlinked WeChat agent) doesn't receive them.
//
// run_lark_cli additionally carries `requiresUserIdentity`: the
// reactive-auth sniff (extracted verbatim from the former
// isUserRequired) — a call with `--as user` short-circuits in
// executeTool when the agent has no user identity.
//
// Extracted from tools.ts as part of the tool-registry refactor:
// schema text + execute bodies are verbatim — no behavior change.
// ============================================================

import type { LlmTool } from './llm';
import { runLarkCli, readSkill, larkSchema } from './lark-executor';
import type { AgentTool, ToolContext } from './tools';

// -----------------------------------------------------------
// Schemas (LLM-visible). Verbatim from the former TOOL_DEFS.
// -----------------------------------------------------------

const readSkillSchema: LlmTool = {
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
};

const schemaSchema: LlmTool = {
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
};

const runLarkCliSchema: LlmTool = {
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
};

// -----------------------------------------------------------
// Reactive auth — only run_lark_cli can require user identity.
// Body verbatim from the former isUserRequired() (minus the
// toolName === 'run_lark_cli' guard, which is now implicit: this
// hook only lives on runLarkCliTool). Tracks the LAST --as value
// across both `--as X` and `--as=X` (cobra keeps the last).
// -----------------------------------------------------------
function larkCliRequiresUser(args: Record<string, unknown>): boolean {
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

export { larkCliRequiresUser };

// -----------------------------------------------------------
// The 3 AgentTool objects. All gated behind requires.feishu.
// -----------------------------------------------------------

export const readSkillTool: AgentTool = {
  schema: readSkillSchema,
  requires: { feishu: true },
  execute: (args, ctx) => {
    const skillPath = args.path ? String(args.path) : undefined;
    return readSkill(String(args.domain ?? ''), ctx, undefined, skillPath);
  }
};

export const schemaTool: AgentTool = {
  schema: schemaSchema,
  requires: { feishu: true },
  execute: (args, ctx) => larkSchema(String(args.method ?? ''), ctx)
};

export const runLarkCliTool: AgentTool = {
  schema: runLarkCliSchema,
  requires: { feishu: true },
  requiresUserIdentity: larkCliRequiresUser,
  execute: (args, ctx) => {
    const argv = Array.isArray(args.argv) ? (args.argv as string[]).map(String) : [];
    return runLarkCli(argv, ctx);
  }
};
