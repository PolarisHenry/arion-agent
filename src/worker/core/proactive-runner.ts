// ============================================================
// Proactive runner — the shared "run one proactive LLM turn"
// core used by both the trigger scheduler (scheduled proactive
// messages) and the auth-replay resume path (re-running a turn
// after the user re-authorizes). Extracted verbatim from
// scheduler.execute so both callers stay in sync.
//
// NOTE: stateless by design — it does NOT load or persist chat
// history. scheduler.execute never did, and trigger/replay turns
// must not start pulling in the chat's prior user conversation.
// ============================================================

import { eq, and } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { config } from '../config';
import { createLogger } from './logger';
import { writeLog } from './log-writer';
import { decryptSecret } from '../../lib/crypto';
import { chat } from './llm';
import { getTools, executeTool, type ToolContext } from './tools';
import { buildSystemPrompt } from './agent-prompt';
import { runAgentLoop, buildWrapUpMessages, WRAP_UP_FALLBACK } from './agent-loop';
import { resolveLoopPolicy } from './agent-policy';

const log = createLogger('proactive-runner');

export type ProactiveSender = (agentId: string, chatId: string, content: string) => Promise<void>;

/** Run one proactive LLM turn: load agent + llm config, build the system
 *  prompt, run the agent loop, do the non-final wrap-up, send the result
 *  (if sendFn given), and write a log row. Returns what the loop produced.
 *
 *  Stateless: no SessionManager.load / save — caller decides persistence. */
export async function runProactiveTurn(args: {
  agentId: string;
  ownerId?: string;
  /** Target chat id. undefined for targetless triggers — MUST NOT be the
   *  'trigger' sentinel, otherwise it leaks into toolCtx.chatId and tools
   *  like manage_schedule would persist a bogus target_chat_id='trigger'. */
  chatId?: string;
  chatType?: string;
  userMessage: string;
  sendFn?: ProactiveSender;
  /** Extra ToolContext fields (authHooks, asUser...) merged into the loop's ctx. */
  toolCtxExtras?: Partial<ToolContext>;
  /** For triggered runs the system prompt gets a triggeredRun block. */
  triggeredRun?: { targetChatId?: string | null };
}): Promise<{
  finalContent: string;
  stopReason: string;
  toolCallLog: { tool: string; args: unknown; result?: string }[];
}> {
  const startTime = Date.now();

  // Load agent (must be active)
  const [agentRow] = await workerDb
    .select()
    .from(agentSchema.agent)
    .where(and(eq(agentSchema.agent.id, args.agentId), eq(agentSchema.agent.status, 'active')))
    .limit(1);
  if (!agentRow) throw new Error(`agent ${args.agentId} not active`);
  const ownerId = args.ownerId ?? agentRow.ownerId;

  // Load LLM config
  const [llmRow] = await workerDb
    .select()
    .from(agentSchema.llmModel)
    .where(eq(agentSchema.llmModel.id, agentRow.llmModelId))
    .limit(1);
  if (!llmRow) throw new Error('llm model not found');

  // Determine whether this agent may make `--as user` calls. Same derivation
  // as agent-runtime.refreshUserAuthStatus: status 'authorized' OR
  // 'incremental_awaiting' (the old token still works for its existing scopes
  // while a new one is being added, so --as user must NOT be short-circuited
  // mid-flow). Without this, executeTool's reactive-auth guard blocks every
  // retried `--as user` call on the replay path — right after onAuthorized,
  // when the agent is definitionally authorized — so the LLM gets a "需要用户
  // 授权" message and markRetry('done') records a false success. Deriving
  // asUser here (instead of via toolCtxExtras) also fixes the trigger path,
  // whose authHooks were previously inert for --as user calls.
  const [authRow] = await workerDb
    .select()
    .from(agentSchema.agentUserAuth)
    .where(eq(agentSchema.agentUserAuth.agentId, args.agentId))
    .limit(1);
  const asUser = authRow?.status === 'authorized' || authRow?.status === 'incremental_awaiting';

  // Build the SAME full system prompt the message path uses (lark guide +
  // time + tool discipline) + an optional triggered-run block telling the
  // model its reply is auto-delivered as bot — so it just outputs content
  // instead of trying to send an IM as the user (the prior failure mode).
  const systemPrompt = await buildSystemPrompt(
    agentRow.systemPrompt,
    args.triggeredRun ? { triggeredRun: args.triggeredRun } : undefined
  );

  const llmConfig = {
    baseUrl: llmRow.baseUrl,
    apiKey: decryptSecret(llmRow.apiKeyCipher),
    modelName: llmRow.modelName,
    temperature: llmRow.temperature ?? 0.7,
    maxTokens: llmRow.maxTokens ?? 8192
  };

  // Stateless: initial messages are just the synthetic user turn — no prior
  // history loaded. runAgentLoop prepends the system prompt fresh each round.
  const messages = [{ role: 'user' as const, content: args.userMessage }];

  const loopResult = await runAgentLoop({
    chat: (msgs, tlz) => chat(llmConfig, msgs, tlz),
    executeTool,
    tools: getTools(),
    systemPrompt,
    initialMessages: messages,
    policy: resolveLoopPolicy(llmRow),
    // No onInterim — proactive turns have no user watching in real time.
    toolCtx: {
      profile: agentRow.larkCliProfile,
      appId: agentRow.appId,
      agentId: agentRow.id,
      ownerId,
      chatId: args.chatId,
      asUser,
      ...args.toolCtxExtras
    }
  });

  let finalResponse = loopResult.finalContent;
  let totalTokens = loopResult.totalTokens;

  if (loopResult.stopReason !== 'final') {
    const wrapUpMessages = buildWrapUpMessages(
      systemPrompt,
      loopResult.messages,
      loopResult.stopReason
    );
    try {
      const wrapUpResp = await chat(llmConfig, wrapUpMessages);
      if (wrapUpResp.content) {
        finalResponse = wrapUpResp.content;
      }
      totalTokens += wrapUpResp.usage.totalTokens;
    } catch (err: any) {
      log.warn(`wrap-up call failed: ${err?.message ?? err}`);
    }
    if (!finalResponse.trim()) {
      finalResponse = WRAP_UP_FALLBACK;
    }
  }

  // Send result via the provided channel (e.g. IM sender) — only when we
  // actually have a real target chatId. Targetless triggers (chatId
  // undefined) have nowhere to deliver, so a send attempt would be doomed.
  if (args.sendFn && args.chatId && finalResponse) {
    try {
      await args.sendFn(args.agentId, args.chatId, finalResponse);
    } catch (err: any) {
      log.error(`send failed: ${err?.message ?? err}`);
    }
  }

  // Write success log row. The 'trigger' fallback is log-row-only — it
  // preserves the pre-refactor audit shape (targetChatId || 'trigger')
  // without leaking the sentinel into toolCtx (handled above).
  await writeLog({
    agentId: agentRow.id,
    ownerId,
    chatId: args.chatId ?? 'trigger',
    type: 'trigger',
    messageContent: args.userMessage,
    responseContent: finalResponse || '(no response)',
    toolCalls: loopResult.toolCallLog.length > 0 ? loopResult.toolCallLog : undefined,
    tokensUsed: totalTokens,
    durationMs: Date.now() - startTime,
    status: 'success',
    stopReason: loopResult.stopReason
  });

  return {
    finalContent: finalResponse,
    stopReason: loopResult.stopReason,
    toolCallLog: loopResult.toolCallLog
  };
}
