import { describe, it, expect } from 'vitest';
import {
  runAgentLoop,
  buildWrapUpMessages,
  WRAP_UP_INSTRUCTIONS,
  WRAP_UP_FALLBACK,
  maskToolResult,
  type LoopDeps,
  type LoopPolicy,
  type StopReason,
  type LoopResult
} from './agent-loop';
import type { ChatResult, LlmMessage } from './llm';

// -----------------------------------------------------------
// Test helpers
// -----------------------------------------------------------

const DEFAULT_POLICY: LoopPolicy = {
  maxRounds: 100,
  maxTokens: 120_000,
  maxWallMs: 120_000,
  maxRepeats: 2,
  maxConsecutiveErrors: 3
};

/** A chat that returns a single final answer (no tool calls). */
function chatFinal(content: string) {
  return async (_msgs: LlmMessage[], _tools?: unknown): Promise<ChatResult> => ({
    content,
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
  });
}

/** A chat that returns tool calls. */
function chatToolCalls(toolCalls: ChatResult['toolCalls'], content?: string) {
  return async (_msgs: LlmMessage[], _tools?: unknown): Promise<ChatResult> => ({
    content: content ?? null,
    toolCalls,
    finishReason: 'tool_calls',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
  });
}

/** A chat that alternates: first N-1 tool calls, then final. */
function chatAlternating(rounds: { toolCalls?: ChatResult['toolCalls']; content?: string }[]) {
  let call = 0;
  return async (_msgs: LlmMessage[], _tools?: unknown): Promise<ChatResult> => {
    const r = rounds[call] ?? rounds[rounds.length - 1];
    call++;
    if (r.toolCalls) {
      return {
        content: r.content ?? null,
        toolCalls: r.toolCalls,
        finishReason: 'tool_calls',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };
    }
    return {
      content: r.content ?? '',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
    };
  };
}

/** A chat that returns escalating totalTokens (for token-budget testing). */
function chatWithTokens(tokensPerCall: number[]) {
  let call = 0;
  return async (_msgs: LlmMessage[], _tools?: unknown): Promise<ChatResult> => {
    const t = tokensPerCall[call] ?? tokensPerCall[tokensPerCall.length - 1];
    const hasTools = call < tokensPerCall.length - 1;
    call++;
    return {
      content: hasTools ? null : 'All done.',
      toolCalls: hasTools ? [{ id: 't1', name: 'search', arguments: '{"q":"test"}' }] : undefined,
      finishReason: hasTools ? 'tool_calls' : 'stop',
      usage: { promptTokens: t, completionTokens: 0, totalTokens: t }
    };
  };
}

/** Returns a chat that never returns final — loops forever unless stopped. */
function chatInfinite(toolName = 'search', args: Record<string, string> = { q: 'test' }) {
  return async (_msgs: LlmMessage[], _tools?: unknown): Promise<ChatResult> => ({
    content: 'Searching...',
    toolCalls: [{ id: 't1', name: toolName, arguments: JSON.stringify(args) }],
    finishReason: 'tool_calls',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
  });
}

function makeDeps(overrides: Partial<LoopDeps> = {}): LoopDeps {
  return {
    chat: chatFinal('Hello!'),
    executeTool: async () => 'result ok',
    tools: [],
    systemPrompt: 'You are a helpful assistant.',
    initialMessages: [{ role: 'user', content: 'hi' }],
    policy: DEFAULT_POLICY,
    toolCtx: { profile: 'test', appId: 'test-app' },
    ...overrides
  };
}

// -----------------------------------------------------------
// Layer 1: maskToolResult
// -----------------------------------------------------------

describe('maskToolResult', () => {
  it('leaves short results untouched regardless of tool', () => {
    expect(maskToolResult('small', 'run_lark_cli', 8000)).toBe('small');
    expect(maskToolResult('small', 'read_skill', 8000)).toBe('small');
  });

  // run_lark_cli can dump huge payloads (e.g. sheets cells-get at 500K chars);
  // those must still be masked so one giant result doesn't balloon every later
  // round's input. Regression guard for narrowing the mask to run_lark_cli.
  it('truncates a long run_lark_cli result with a metadata header', () => {
    const big = 'x'.repeat(20_000);
    const out = maskToolResult(big, 'run_lark_cli', 8000);
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain('工具结果已截断');
    expect(out).toContain('run_lark_cli');
  });

  // The driving change: read_skill returns markdown docs the model CHOSE to
  // read on demand (SKILL.md + reference files). Head+tail truncation makes a
  // doc unusable — the attrs/schema detail lives in the middle. Layer 2
  // (applyFidelityDrop) retires old read_skill results by recency, so leaving
  // them whole here doesn't let context grow unbounded.
  it('does NOT truncate read_skill results even when over maxChars', () => {
    const big = 'x'.repeat(20_000);
    expect(maskToolResult(big, 'read_skill', 8000)).toBe(big);
  });

  it('never touches non-lark tools (manage_schedule / memory)', () => {
    const big = 'x'.repeat(20_000);
    expect(maskToolResult(big, 'manage_schedule', 8000)).toBe(big);
    expect(maskToolResult(big, 'memory', 8000)).toBe(big);
  });
});

// -----------------------------------------------------------
// Stop path: 'final' (natural exit)
// -----------------------------------------------------------

describe('runAgentLoop stop reason: final', () => {
  it('returns final on the first round when model has no tool calls', async () => {
    const deps = makeDeps({ chat: chatFinal('Hello, world!') });
    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('Hello, world!');
    expect(result.messages).toHaveLength(1); // only the initial user message
    expect(result.toolCallLog).toHaveLength(0);
  });

  it('returns final after N tool-call rounds followed by a natural final answer', async () => {
    const chat = chatAlternating([
      { toolCalls: [{ id: 'a1', name: 'search', arguments: '{"q":"x"}' }] },
      { toolCalls: [{ id: 'a2', name: 'search', arguments: '{"q":"y"}' }] },
      { content: 'Found them!' } // final
    ]);

    const deps = makeDeps({
      chat,
      tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }]
    });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('Found them!');
    expect(result.toolCallLog).toHaveLength(2);
    // Messages: initial user + 2 assistant + 2 tool (final answer NOT in messages yet — caller adds it)
    expect(result.messages).toHaveLength(5);
  });

  it('delivers interim prose via onInterim when model writes content alongside tool_calls', async () => {
    const interims: string[] = [];
    const chat = chatAlternating([
      {
        toolCalls: [{ id: 'a1', name: 'search', arguments: '{"q":"x"}' }],
        content: 'Let me check...'
      },
      { content: 'Done.' }
    ]);

    const deps = makeDeps({
      chat,
      tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }],
      onInterim: async (c) => {
        interims.push(c);
      }
    });

    await runAgentLoop(deps);

    expect(interims).toEqual(['Let me check...']);
  });
});

// -----------------------------------------------------------
// Stop path: 'repetition' (same tool+args detected)
// -----------------------------------------------------------

describe('runAgentLoop stop reason: repetition', () => {
  it('stops after maxRepeats consecutive identical tool+args calls', async () => {
    const chat = chatInfinite('search', { q: 'same query' });
    const policy: LoopPolicy = { ...DEFAULT_POLICY, maxRepeats: 2 };

    const deps = makeDeps({ chat, policy });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('repetition');
    expect(result.toolCallLog.length).toBeGreaterThanOrEqual(2);
    // All logged calls should be the same tool with the same args
    const calls = result.toolCallLog;
    for (const c of calls) {
      expect(c.tool).toBe('search');
      expect(c.args).toEqual({ q: 'same query' });
    }
  });

  it('does NOT trigger repetition when args differ (legitimate pagination/entity change)', async () => {
    // Simulate: search page 1, search page 2, search page 3 — all different args
    let call = 0;
    const pages = [
      { q: 'test', offset: 0 },
      { q: 'test', offset: 10 },
      { q: 'test', offset: 20 }
    ];
    const chat = async (): Promise<ChatResult> => {
      const page = pages[call];
      call++;
      if (call > pages.length)
        return {
          content: 'Done.',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
        };
      return {
        content: 'Fetching...',
        toolCalls: [{ id: 't1', name: 'search', arguments: JSON.stringify(page) }],
        finishReason: 'tool_calls',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };
    };

    const policy: LoopPolicy = { ...DEFAULT_POLICY, maxRepeats: 2 };
    const deps = makeDeps({
      chat,
      policy,
      tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }]
    });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('final');
    expect(result.toolCallLog).toHaveLength(3);
  });

  it('resets repetition counter when a different tool is called in between', async () => {
    const rounds = [
      { toolCalls: [{ id: 'a1', name: 'search', arguments: '{"q":"x"}' }] },
      { toolCalls: [{ id: 'a2', name: 'read', arguments: '{"id":"1"}' }] }, // different tool
      { toolCalls: [{ id: 'a3', name: 'search', arguments: '{"q":"x"}' }] }, // back to same as round 1
      { content: 'Done.' }
    ];

    const chat = chatAlternating(rounds);

    const policy: LoopPolicy = { ...DEFAULT_POLICY, maxRepeats: 2 };
    const deps = makeDeps({
      chat,
      policy,
      tools: [
        { type: 'function', function: { name: 'search', description: '', parameters: {} } },
        { type: 'function', function: { name: 'read', description: '', parameters: {} } }
      ]
    });

    const result = await runAgentLoop(deps);

    // Should NOT trigger repetition — the same tool call was not consecutive
    expect(result.stopReason).toBe('final');
  });
});

// -----------------------------------------------------------
// Stop path: 'error-streak' (consecutive tool errors)
// -----------------------------------------------------------

describe('runAgentLoop stop reason: error-streak', () => {
  it('stops after maxConsecutiveErrors consecutive failing tool results', async () => {
    const chat = chatInfinite('fragile_tool', { input: 'bad' });
    const policy: LoopPolicy = { ...DEFAULT_POLICY, maxConsecutiveErrors: 3, maxRepeats: 999 };

    const deps = makeDeps({
      chat,
      policy,
      executeTool: async () => '[调用失败] something went wrong'
    });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('error-streak');
    expect(result.toolCallLog.length).toBeGreaterThanOrEqual(3);
  });

  it('resets error counter on a successful tool call', async () => {
    let toolCall = 0;
    const chat = async (): Promise<ChatResult> => {
      toolCall++;
      if (toolCall >= 6)
        return {
          content: 'Done.',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
        };
      return {
        content: 'Trying...',
        toolCalls: [{ id: 't1', name: 'flaky', arguments: '{}' }],
        finishReason: 'tool_calls',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };
    };

    const policy: LoopPolicy = { ...DEFAULT_POLICY, maxConsecutiveErrors: 3, maxRepeats: 999 };
    const deps = makeDeps({
      chat,
      policy,
      // Return: fail, fail, success, fail, fail, success → never 3 consecutive fails
      executeTool: async () => {
        const c = toolCall;
        if (c === 3 || c === 6) return 'result ok';
        return '[调用失败] error';
      }
    });

    const result = await runAgentLoop(deps);

    // Error counter resets on success, so we never hit 3 consecutive
    expect(result.stopReason).toBe('final');
  });
});

// -----------------------------------------------------------
// Regression: parallel tool calls + mid-batch guardrail must not orphan
// tool_call_ids (causes 400 "insufficient tool messages following tool_calls").
// -----------------------------------------------------------

describe('runAgentLoop tool-call / tool-result pairing', () => {
  it('pairs every tool_call_id with a tool message when repetition trips mid-batch', async () => {
    // Round 1: search q=a (repeatCount=1). Round 2: TWO parallel calls — the
    // first repeats search q=a (trips maxRepeats=2), the second (create) is a
    // different tool that must STILL get a tool message. Breaking mid-batch
    // leaves the assistant tool_calls message without a result for `create`,
    // and the caller's wrap-up chat() then 400s.
    const chat = chatAlternating([
      { toolCalls: [{ id: 'r1', name: 'search', arguments: '{"q":"a"}' }] },
      {
        toolCalls: [
          { id: 'r2a', name: 'search', arguments: '{"q":"a"}' },
          { id: 'r2b', name: 'create', arguments: '{"x":1}' }
        ]
      }
    ]);
    const executed: string[] = [];

    const result = await runAgentLoop(
      makeDeps({
        chat,
        policy: { ...DEFAULT_POLICY, maxRepeats: 2 },
        executeTool: async (name) => {
          executed.push(name);
          return 'ok';
        }
      })
    );

    const requested = result.messages.flatMap((m) => m.tool_calls?.map((tc) => tc.id) ?? []);
    const answered = result.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);

    // Every requested tool_call_id must have a matching tool result — no orphans.
    expect(answered).toHaveLength(requested.length);
    for (const id of requested) {
      expect(answered).toContain(id);
    }
    expect(executed).toContain('create');
    expect(result.stopReason).toBe('repetition');
  });

  it('pairs every tool_call_id with a tool message when error-streak trips mid-batch', async () => {
    // Single batch: [failing, good]. maxConsecutiveErrors=1 trips on the first
    // (failing) call — but `good` must still get a tool message.
    const chat = chatToolCalls([
      { id: 'e1', name: 'fragile', arguments: '{}' },
      { id: 'g1', name: 'good', arguments: '{}' }
    ]);
    const executed: string[] = [];

    const result = await runAgentLoop(
      makeDeps({
        chat,
        policy: { ...DEFAULT_POLICY, maxConsecutiveErrors: 1, maxRepeats: 999 },
        executeTool: async (name) => {
          executed.push(name);
          return name === 'fragile' ? '[调用失败] boom' : 'ok';
        }
      })
    );

    const requested = result.messages.flatMap((m) => m.tool_calls?.map((tc) => tc.id) ?? []);
    const answered = result.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);

    expect(answered).toHaveLength(requested.length);
    for (const id of requested) {
      expect(answered).toContain(id);
    }
    expect(executed).toContain('good');
    expect(result.stopReason).toBe('error-streak');
  });
});

// -----------------------------------------------------------
// Stop path: 'token-budget' (cumulative tokens)
// -----------------------------------------------------------

describe('runAgentLoop stop reason: token-budget', () => {
  it('stops when cumulative totalTokens exceeds maxTokens', async () => {
    const chat = chatWithTokens([50_000, 50_000, 30_000]); // 50k + 50k = 100k, then 30k would push over
    const policy: LoopPolicy = { ...DEFAULT_POLICY, maxTokens: 90_000, maxRepeats: 999 };

    const deps = makeDeps({
      chat,
      policy,
      tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }]
    });

    const result = await runAgentLoop(deps);

    // After first call: 50k. Second call: total = 100k >= 90k → token-budget
    // Wait — the check happens at the TOP of the loop. After round 0 (50k),
    // round 1 starts: 50k < 90k → proceed, calls chat → 100k total.
    // Round 2 starts: 100k >= 90k → stop.
    // Actually, after round 1, totalTokens = 100k. Round 2 check: 100k >= 90k → stop.
    // But wait, round 1's response had tool_calls, so we'd need round 2 to get final.
    // Actually let me re-read the chatWithTokens: call 0 = 50k (tool), call 1 = 50k (tool), call 2 = final.
    // Round 0: totalTokens=50k, has tools → continue
    // Round 1: check 50k < 90k → proceed, chat → totalTokens=100k, has tools → continue
    // Round 2: check 100k >= 90k → token-budget, break
    expect(result.stopReason).toBe('token-budget');
    expect(result.totalTokens).toBe(100_000);
  });

  it('does NOT trigger token-budget when provider reports 0 usage (graceful degradation)', async () => {
    // totalTokens stays at 0 → never >= maxTokens → other guardrails catch it
    const chat = async (): Promise<ChatResult> => ({
      content: null,
      toolCalls: [{ id: 't1', name: 'search', arguments: '{}' }],
      finishReason: 'tool_calls',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    });

    const policy: LoopPolicy = {
      ...DEFAULT_POLICY,
      maxTokens: 1000,
      maxRounds: 3,
      maxRepeats: 999
    };
    const deps = makeDeps({ chat, policy });

    const result = await runAgentLoop(deps);

    // With 0 usage, token-budget never fires. Round-ceiling catches it at maxRounds.
    expect(result.stopReason).toBe('round-ceiling');
    expect(result.totalTokens).toBe(0);
  });
});

// -----------------------------------------------------------
// Stop path: 'round-ceiling' (maxRounds exhausted)
// -----------------------------------------------------------

describe('runAgentLoop stop reason: round-ceiling', () => {
  it('stops with round-ceiling when all rounds are exhausted with tool calls', async () => {
    const chat = chatInfinite();
    const policy: LoopPolicy = {
      maxRounds: 3,
      maxTokens: 999_999,
      maxWallMs: 999_999,
      maxRepeats: 999,
      maxConsecutiveErrors: 999
    };

    const deps = makeDeps({ chat, policy });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('round-ceiling');
    expect(result.toolCallLog.length).toBeGreaterThanOrEqual(3);
    expect(result.finalContent).toBe('');
  });
});

// -----------------------------------------------------------
// Stop path: 'timeout' (wall-clock)
// -----------------------------------------------------------

describe('runAgentLoop stop reason: timeout', () => {
  it('stops with timeout when wall-clock exceeds maxWallMs', async () => {
    // Use a very small wall-clock limit and a slow chat
    const chat = async (): Promise<ChatResult> => {
      // Simulate a slow LLM call
      await new Promise((r) => setTimeout(r, 20));
      return {
        content: null,
        toolCalls: [{ id: 't1', name: 'search', arguments: '{}' }],
        finishReason: 'tool_calls',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      };
    };

    const policy: LoopPolicy = {
      ...DEFAULT_POLICY,
      maxWallMs: 10,
      maxRounds: 100,
      maxTokens: 999_999
    };

    const deps = makeDeps({ chat, policy });

    const result = await runAgentLoop(deps);

    // After the first slow chat (20ms), the next round's wall check should fire
    // Actually the check is at the top of the loop, so round 1 starts → wall check
    // But by the time we get there, >10ms has passed
    expect(result.stopReason).toBe('timeout');
  });
});

// -----------------------------------------------------------
// Wrap-up message generation
// -----------------------------------------------------------

describe('buildWrapUpMessages', () => {
  const stopReasons: Exclude<StopReason, 'final'>[] = [
    'token-budget',
    'timeout',
    'repetition',
    'error-streak',
    'round-ceiling'
  ];

  for (const reason of stopReasons) {
    it(`builds wrap-up messages for stop reason: ${reason}`, () => {
      const history: LlmMessage[] = [
        { role: 'user', content: '请帮我做一件事' },
        { role: 'assistant', content: '好的，我先查一下。' }
      ];

      const messages = buildWrapUpMessages('你是助手', history, reason);

      // Structure: system + history[0] + history[1] + user instruction = 4 messages
      expect(messages).toHaveLength(4);
      expect(messages[0]).toEqual({ role: 'system', content: '你是助手' });
      expect(messages[1]).toEqual(history[0]);
      expect(messages[2]).toEqual(history[1]);
      expect(messages[3].role).toBe('user');
      expect(messages[3].content).toContain('继续');
      expect(messages[3].content).toContain('不要编造');
    });
  }

  it('each stop reason produces a distinct instruction', () => {
    const instructions = stopReasons.map((r) => buildWrapUpMessages('sys', [], r)[1].content);
    const unique = new Set(instructions);
    expect(unique.size).toBe(stopReasons.length);
  });

  it('each wrap-up instruction demands honest reporting (no fabrication)', () => {
    for (const reason of stopReasons) {
      const msgs = buildWrapUpMessages('sys', [], reason);
      const instruction = msgs[msgs.length - 1].content;
      expect(instruction).toContain('不要编造');
      expect(instruction).toContain('继续');
    }
  });
});

// -----------------------------------------------------------
// Wrap-up constants
// -----------------------------------------------------------

describe('wrap-up constants', () => {
  it('WRAP_UP_INSTRUCTIONS has entries for all non-final stop reasons', () => {
    const reasons: Exclude<StopReason, 'final'>[] = [
      'token-budget',
      'timeout',
      'repetition',
      'error-streak',
      'round-ceiling'
    ];
    for (const r of reasons) {
      expect(WRAP_UP_INSTRUCTIONS[r]).toBeDefined();
      expect(WRAP_UP_INSTRUCTIONS[r].length).toBeGreaterThan(30);
    }
  });

  it('WRAP_UP_FALLBACK is non-empty and hints at resume', () => {
    expect(WRAP_UP_FALLBACK.length).toBeGreaterThan(10);
    expect(WRAP_UP_FALLBACK).toContain('继续');
  });
});

// -----------------------------------------------------------
// Edge cases
// -----------------------------------------------------------

describe('runAgentLoop edge cases', () => {
  it('handles empty initialMessages gracefully', async () => {
    const chat = chatFinal('Hi!');
    const deps = makeDeps({ chat, initialMessages: [] });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('Hi!');
    expect(result.messages).toHaveLength(0);
  });

  it('handles model returning empty content with no tool calls on first round', async () => {
    const chat = chatFinal('');
    const deps = makeDeps({ chat });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('');
  });

  it('onInterim failure does not abort the loop', async () => {
    const chat = chatAlternating([
      { toolCalls: [{ id: 'a1', name: 'search', arguments: '{}' }], content: 'Checking...' },
      { content: 'Done.' }
    ]);

    const deps = makeDeps({
      chat,
      tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }],
      onInterim: async () => {
        throw new Error('send failed');
      }
    });

    const result = await runAgentLoop(deps);

    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('Done.');
  });
});

// -----------------------------------------------------------
// Announce-without-acting nudge — when the model writes an
// action promise ("好嘞我先给你建") but emits NO tool call, the
// loop must not ship that promise as the final answer. It injects
// one "commit: act or ask" nudge and gives the model another round.
// -----------------------------------------------------------

describe('runAgentLoop announce-without-acting nudge', () => {
  it('nudges when the model fake-promises an action, so the tool actually runs', async () => {
    // Round 0: pure prose promise, no tool call (the bug).
    // Round 1: after the nudge, the model actually calls manage_schedule.
    // Round 2: real final answer.
    let call = 0;
    const chat = async (): Promise<ChatResult> => {
      call++;
      if (call === 1) {
        return {
          content: '好嘞！我先给你建个任务提醒「看一下吃啥」',
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
        };
      }
      if (call === 2) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'ms1',
              name: 'manage_schedule',
              arguments: '{"action":"create","name":"看一下吃啥"}'
            }
          ],
          finishReason: 'tool_calls',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        };
      }
      return {
        content: '✅ 已创建提醒「看一下吃啥」。',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
      };
    };

    const deps = makeDeps({
      chat,
      tools: [
        { type: 'function', function: { name: 'manage_schedule', description: '', parameters: {} } }
      ]
    });

    const result = await runAgentLoop(deps);

    // The tool was actually executed — without the nudge this stays at 0.
    expect(result.toolCallLog).toHaveLength(1);
    expect(result.toolCallLog[0].tool).toBe('manage_schedule');
    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('✅ 已创建提醒「看一下吃啥」。');
    // A nudge user-message was injected between the promise and the tool call.
    expect(
      result.messages.some(
        (m) =>
          m.role === 'user' && typeof m.content === 'string' && m.content.includes('只承诺不执行')
      )
    ).toBe(true);
  });

  it('does NOT nudge a genuine clarifying question (legit ask-then-act final)', async () => {
    let calls = 0;
    const chat = async (): Promise<ChatResult> => {
      calls++;
      return {
        content: '你想把账号密码搬到哪个文档？我需要知道目标位置才能搬。',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
      };
    };
    const deps = makeDeps({ chat });
    const result = await runAgentLoop(deps);

    expect(calls).toBe(1); // no extra nudge round
    expect(result.stopReason).toBe('final');
    expect(result.toolCallLog).toHaveLength(0);
    expect(result.finalContent).toContain('搬到哪个文档');
    expect(
      result.messages.some(
        (m) =>
          m.role === 'user' && typeof m.content === 'string' && m.content.includes('只承诺不执行')
      )
    ).toBe(false);
  });

  it('does NOT nudge chit-chat / plain answers with no promise phrase', async () => {
    let calls = 0;
    const chat = async (): Promise<ChatResult> => {
      calls++;
      return {
        content: '你好！有什么可以帮你的吗？',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
      };
    };
    const deps = makeDeps({ chat });
    const result = await runAgentLoop(deps);

    expect(calls).toBe(1);
    expect(result.stopReason).toBe('final');
    expect(result.finalContent).toBe('你好！有什么可以帮你的吗？');
  });

  it('does NOT nudge a promise-word summary AFTER real work was already done', async () => {
    // Round 0: real tool call. Round 1: summary that happens to contain "我帮"
    // — must NOT trigger a nudge, because toolCallLog is no longer empty.
    let call = 0;
    const chat = async (): Promise<ChatResult> => {
      call++;
      if (call === 1) {
        return {
          content: null,
          toolCalls: [{ id: 's1', name: 'search', arguments: '{"q":"x"}' }],
          finishReason: 'tool_calls',
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
        };
      }
      return {
        content: '我帮你查到了，结果如下……',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
      };
    };
    const deps = makeDeps({
      chat,
      tools: [{ type: 'function', function: { name: 'search', description: '', parameters: {} } }]
    });
    const result = await runAgentLoop(deps);

    expect(call).toBe(2); // no nudge round after the summary
    expect(result.stopReason).toBe('final');
    expect(result.toolCallLog).toHaveLength(1);
    expect(result.finalContent).toBe('我帮你查到了，结果如下……');
  });
});
