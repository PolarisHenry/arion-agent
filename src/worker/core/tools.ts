// ============================================================
// Tool registry — the LLM tool surface, as a registry of
// self-describing AgentTool modules. Adding a tool = create a
// file that exports an AgentTool, then add one line to ALL.
// There is no second place to forget (no separate schema array
// + dispatch branch kept in sync by hand).
//
// Stable surface (imported across the worker — signatures fixed):
//   getTools(feishuLinked) → LlmTool[]
//   executeTool(name, args, ctx) → string
//   ToolContext, AuthHooks (types)
//
// Tool implementations live in sibling modules:
//   ./lark-tools    read_skill / schema / run_lark_cli (→ ./lark-executor)
//   ./schedule-tool manage_schedule (internal, DB-backed)
//   ./memory-tool   memory (internal, DB-backed)
// ============================================================

import { createLogger } from './logger';
import type { LlmTool } from './llm';
import { readSkillTool, schemaTool, runLarkCliTool } from './lark-tools';
import { scheduleTool } from './schedule-tool';
import { memoryTool } from './memory-tool';

const log = createLogger('tools');

// -----------------------------------------------------------
// AgentTool — the unit every tool is built from.
// -----------------------------------------------------------

export type AgentTool = {
  /** What the LLM sees (OpenAI function-calling shape). */
  schema: LlmTool;
  /** What actually runs. Contract: returns a string fed back to the model. */
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  /** Declarative gating. feishu=true → only agents with Feishu access receive
   *  this tool. Omit → every agent gets it. */
  requires?: { feishu?: boolean };
  /** Reactive auth: when this returns true and ctx.asUser is false, executeTool
   *  short-circuits with a "needs authorization" message before execute runs.
   *  Only run_lark_cli sets this. */
  requiresUserIdentity?: (args: Record<string, unknown>) => boolean;
};

// -----------------------------------------------------------
// Auth + context types (stable surface). Imported by agent-runtime,
// proactive-runner, agent-loop, lark-executor, scheduler, agent-manager.
// -----------------------------------------------------------

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

// -----------------------------------------------------------
// Registry
// -----------------------------------------------------------

// Order preserved from the former TOOL_DEFS (lark trio → schedule → memory).
// Tool order can nudge the model's selection, so keep it stable.
const ALL: AgentTool[] = [readSkillTool, schemaTool, runLarkCliTool, scheduleTool, memoryTool];
const byName = new Map(ALL.map((t) => [t.schema.function.name, t]));

/** The LLM-visible tool set. feishuLinked=true → all tools (agent can drive
 *  Feishu via lark-cli); false → only the platform-agnostic subset
 *  (manage_schedule, memory). Defaults to true so no-arg callers keep all. */
export function getTools(feishuLinked: boolean = true): LlmTool[] {
  return ALL.filter((t) => !t.requires?.feishu || feishuLinked).map((t) => t.schema);
}

/** Execute a tool call by name. Reactive auth: a tool whose requiresUserIdentity
 *  says the call needs user identity short-circuits when the agent has none. */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const tool = byName.get(toolName);
  if (!tool) {
    log.warn(`Unknown tool: ${toolName}`);
    return `Unknown tool: ${toolName}`;
  }
  // Reactive auth: run_lark_cli with --as user needs the agent's user identity.
  if (tool.requiresUserIdentity?.(args) && !ctx.asUser) {
    return [
      `[需要用户授权] ${toolName} 要以用户身份操作，但本智能体还未授权用户身份。`,
      `请把以上转达给用户：需要到 dashboard → 该智能体 →「用户身份」→ 授权；用户回复前，不要重试本命令。`
    ].join('\n');
  }
  return tool.execute(args, ctx);
}
