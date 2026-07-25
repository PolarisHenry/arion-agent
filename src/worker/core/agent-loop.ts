// ============================================================
// Agent Loop — progress-aware adaptive loop shared by the
// message path (agent-runtime) and trigger path (scheduler).
// Replaces the hardcoded for (round < maxToolCallRounds) with
// 6 real resource/progress signals.
// ============================================================

import type { LlmMessage, LlmTool, ChatResult } from './llm';
import type { ToolContext } from './tools';

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------

/** Dependencies injected into runAgentLoop so it stays pure and testable. */
export type LoopDeps = {
  /** Non-streaming chat — loop needs full tool_calls per round. */
  chat: (messages: LlmMessage[], tools?: LlmTool[]) => Promise<ChatResult>;
  /** Tool executor — returns the result string fed back to the model. */
  executeTool: (name: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
  tools: LlmTool[];
  systemPrompt: string;
  /** Initial messages WITHOUT the system prompt (system is prepended fresh each round). */
  initialMessages: LlmMessage[];
  policy: LoopPolicy;
  /** Interim prose callback (e.g. "我查一下~") — delivered to user before tools run. */
  onInterim?: (content: string) => Promise<void>;
  toolCtx: ToolContext;
};

/** Stop policy: resource caps + stuck guards. "maxRepeats" and "maxConsecutiveErrors"
 *  are stuck guards (no-progress → stop); the rest are resource caps (depleted → stop). */
export type LoopPolicy = {
  /** Hard ceiling on rounds — token-budget's final fuse. */
  maxRounds: number;
  /** Cumulative token budget — Claude Code context-window analogue. */
  maxTokens: number;
  /** Max wall-clock ms for the entire loop (not per-round). */
  maxWallMs: number;
  /** Consecutive same tool+args before declaring a loop. */
  maxRepeats: number;
  /** Consecutive tool errors before giving up. */
  maxConsecutiveErrors: number;
};

/** Why the loop stopped. */
export type StopReason =
  | 'final' // model returned a no-tool-call final answer
  | 'token-budget' // cumulative tokens exceeded maxTokens
  | 'timeout' // wall-clock exceeded maxWallMs
  | 'repetition' // same tool+args repeated maxRepeats times
  | 'error-streak' // consecutive tool errors hit maxConsecutiveErrors
  | 'round-ceiling'; // hit maxRounds (should be rare — token-budget catches first)

/** What runAgentLoop returns. */
export type LoopResult = {
  /** Complete message history (system prompt NOT included — caller prepends it). */
  messages: LlmMessage[];
  /** Final answer text (empty when stopReason !== 'final' — caller does wrap-up). */
  finalContent: string;
  /** Audit log of every tool call and its result. */
  toolCallLog: { tool: string; args: unknown; result?: string }[];
  /** Cumulative tokens consumed across all rounds. 0 if provider reports none. */
  totalTokens: number;
  /** Why the loop exited. */
  stopReason: StopReason;
};

// -----------------------------------------------------------
// Wrap-up instruction per stop reason
// -----------------------------------------------------------

/** Per-stop-reason wrap-up instructions. All demand honest progress reporting
 *  and include a "回复「继续」可接着处理" resume hint. */
export const WRAP_UP_INSTRUCTIONS: Record<Exclude<StopReason, 'final'>, string> = {
  'token-budget':
    '你已达到本轮的 token 预算上限，现在不能再调用任何工具。请根据上面已经完成的操作，给用户一个真实、简洁的进展说明：已经做了什么、还剩下什么没做完，并告诉用户回复「继续」你就可以接着处理。不要编造未完成的结果——没做完的就如实说没做完。用你一贯的口吻，简洁回复。',
  timeout:
    '本轮处理时间较长，已达到时间上限，现在不能再调用任何工具。请根据上面已经完成的操作，给用户一个真实、简洁的进展说明：已经做了什么、还剩下什么没做完，并告诉用户回复「继续」你就可以接着处理。不要编造未完成的结果——没做完的就如实说没做完。用你一贯的口吻，简洁回复。',
  repetition:
    '你的工具调用似乎卡住了（同一工具+参数连续重复多次），现在不能再调用任何工具。请根据上面已经完成的操作，给用户一个真实、简洁的进展说明：已经做了什么、还剩下什么没做完，并告诉用户回复「继续」你就可以接着处理。不要编造未完成的结果——没做完的就如实说没做完。用你一贯的口吻，简洁回复。',
  'error-streak':
    '工具连续多次报错，现在不能再调用任何工具。请根据上面已经完成的操作，给用户一个真实、简洁的进展说明：已经做了什么、还剩下什么没做完，并告诉用户回复「继续」你就可以接着处理。不要编造未完成的结果——没做完的就如实说没做完。用你一贯的口吻，简洁回复。',
  'round-ceiling':
    '你已达到本轮的工具调用轮次上限，现在不能再调用任何工具。请根据上面已经完成的操作，给用户一个真实、简洁的进展说明：已经做了什么、还剩下什么没做完，并告诉用户回复「继续」你就可以接着处理。不要编造未完成的结果——没做完的就如实说没做完。用你一贯的口吻，简洁回复。'
};

/** Fallback text when the wrap-up call itself produces no content. */
export const WRAP_UP_FALLBACK =
  '（本轮已达到处理上限，任务还没全部完成。回复「继续」我可以接着处理。）';

// -----------------------------------------------------------
// Announce-without-acting nudge
// -----------------------------------------------------------

/** Promise-of-action phrases that signal the model is narrating intent
 *  ("好嘞我先给你建") instead of acting. Their ABSENCE means a no-tool-call
 *  reply is a legit final — a real answer or a real clarifying question — so
 *  it must NOT be nudged. */
const PROMISE_RE = /(我去|我来|我会|我帮|马上|稍等|这就|先给你|这就去|马上来|我去查|我来看|待会儿)/;

/** Injected as a user message when the model fake-promises an action. Forces a
 *  single "commit: act now or ask a specific question" decision so the loop
 *  never ships an unfulfilled promise ("好嘞我先去建" + nothing) as the final
 *  answer. One nudge max — see `nudged` in runAgentLoop. */
const NUDGE_INSTRUCTION = [
  '系统检测：你上一条说要去执行某个操作，但本回合没有调用任何工具，也没有给出一个具体的澄清问题——这是被禁止的「只承诺不执行」。',
  '请在下面两条里选一条，不要再回「我马上去 / 这就去查」之类的话：',
  '(1) 信息齐全、你确实能做：立刻调用对应工具把它做完。',
  '(2) 缺决定性参数（时间 / 目标 / 对象 / 源…）：直接抛出一个具体的澄清问题——列清楚你缺什么、给几个选项，然后停下等用户回复。不要猜参数硬做。'
].join('\n');

/** Build the message list for a non-final wrap-up call: system prompt + full
 *  turn history + a stop-reason-specific instruction to summarize honestly.
 *  Pure — does not call the LLM. */
export function buildWrapUpMessages(
  systemPrompt: string,
  history: LlmMessage[],
  stopReason: Exclude<StopReason, 'final'>
): LlmMessage[] {
  const instruction = WRAP_UP_INSTRUCTIONS[stopReason];
  return [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: instruction }
  ];
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

/** Stable key for tool+args for repetition detection. */
function argsKey(args: Record<string, unknown>): string {
  return JSON.stringify(args, Object.keys(args).sort());
}

/** Whether a tool result string indicates a definitive error (not a preview or
 *  confirmation request). Conservative — only counts clear failures. */
function isToolError(result: string): boolean {
  return (
    /^\[(调用失败|权限不足|用户授权失效|需要用户授权)\]/.test(result) ||
    result.startsWith('[schedule] error:') ||
    result.startsWith('Unknown tool:')
  );
}

// -----------------------------------------------------------
// Core loop
// -----------------------------------------------------------

/** Run an adaptive agent loop with resource caps and stuck-guard stop
 *  conditions. Pure function — all I/O is injected via deps so it can be
 *  unit-tested without real LLM calls or tool execution.
 *
 *  Normal exit: model returns a response with no tool_calls → stopReason 'final'.
 *  Any other exit: stopReason reflects what tripped; caller should follow up
 *  with buildWrapUpMessages() + a tool-free streamChat to report progress. */
export async function runAgentLoop(deps: LoopDeps): Promise<LoopResult> {
  const { chat, executeTool, tools, systemPrompt, initialMessages, policy, onInterim, toolCtx } =
    deps;

  // Working copy — we mutate this and return it
  const messages: LlmMessage[] = [...initialMessages];
  const toolCallLog: LoopResult['toolCallLog'] = [];
  let totalTokens = 0;
  let stopReason: StopReason = 'final';
  let finalContent = '';

  // Track whether we got a natural final answer (model returned no tool calls).
  // Distinct from stopReason because stopReason='final'+!finalContent is also
  // how we start — we need to know if we actually exited via a model decision.
  let reachedFinal = false;

  // Repetition detection state
  let lastRepeatKey = '';
  let repeatCount = 0;

  // Consecutive error state
  let consecutiveErrors = 0;

  // Whether we've already issued the announce-without-acting nudge. One max —
  // if the model still fake-promises after being nudged, accept it as final
  // rather than looping forever.
  let nudged = false;

  const loopStartMs = Date.now();

  for (let round = 0; round < policy.maxRounds; round++) {
    // —— Per-round resource checks ——
    if (totalTokens >= policy.maxTokens && policy.maxTokens > 0) {
      stopReason = 'token-budget';
      break;
    }
    if (Date.now() - loopStartMs >= policy.maxWallMs) {
      stopReason = 'timeout';
      break;
    }

    // Build messages for this round only (system prompt is NOT persisted)
    const llmMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
    const resp = await chat(llmMessages, tools);

    totalTokens += resp.usage.totalTokens;

    // Model returned no tool calls. Usually that's the natural final answer —
    // BUT if no tool has run yet this turn and the prose reads like an action
    // promise ("好嘞我先给你建"), the model is announcing intent without
    // acting. Inject one "commit: act or ask" nudge and continue, rather than
    // shipping an unfulfilled promise as the final answer. Genuine clarifying
    // questions and chit-chat contain no promise phrase → fall straight through
    // to a legit final (and never cost an extra round).
    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      const prose = (resp.content ?? '').trim();
      if (!nudged && toolCallLog.length === 0 && PROMISE_RE.test(prose)) {
        nudged = true;
        messages.push({ role: 'assistant', content: resp.content ?? '' });
        messages.push({ role: 'user', content: NUDGE_INSTRUCTION });
        continue;
      }
      reachedFinal = true;
      if (resp.content) {
        finalContent = resp.content;
      }
      break;
    }

    // Model is working — push the assistant message with tool_calls
    messages.push({
      role: 'assistant',
      content: resp.content ?? '',
      tool_calls: resp.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments }
      }))
    });

    // Deliver interim prose if the model wrote any (e.g. "我查一下~")
    if (resp.content && resp.content.trim() && onInterim) {
      try {
        await onInterim(resp.content);
      } catch {
        // Interim delivery failures must not abort the turn
      }
    }

    // Execute each tool call, checking stuck guards after each
    let shouldBreak = false;
    for (const tc of resp.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        args = {};
      }

      // Execute first
      const result = await executeTool(tc.name, args, toolCtx);
      toolCallLog.push({ tool: tc.name, args, result });

      // Push tool result into messages BEFORE stuck-guard checks so the
      // message history always stays valid (assistant tool_calls must be
      // followed by tool messages per LLM provider requirements).
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
        name: tc.name
      });

      // —— Repetition check (after execution) ——
      const key = `${tc.name}:${argsKey(args)}`;
      if (key === lastRepeatKey) {
        repeatCount++;
      } else {
        repeatCount = 1;
        lastRepeatKey = key;
      }
      if (repeatCount >= policy.maxRepeats) {
        stopReason = 'repetition';
        shouldBreak = true;
        break;
      }

      // —— Consecutive error check (after execution) ——
      if (isToolError(result)) {
        consecutiveErrors++;
      } else {
        consecutiveErrors = 0;
      }
      if (consecutiveErrors >= policy.maxConsecutiveErrors) {
        stopReason = 'error-streak';
        shouldBreak = true;
        break;
      }
    }

    if (shouldBreak) break;
  }

  // Post-loop: determine stop reason. We exited naturally or via break.
  if (!reachedFinal && stopReason === 'final') {
    // We ran all rounds without reaching a final answer AND without hitting
    // any guardrail → round-ceiling.
    stopReason = 'round-ceiling';
  }

  return {
    messages,
    finalContent,
    toolCallLog,
    totalTokens,
    stopReason
  };
}
