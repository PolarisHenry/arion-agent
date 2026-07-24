// ============================================================
// LLM client — OpenAI-compatible chat completions with tools
// ============================================================

import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger';

const log = createLogger('llm');

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
};

export type LlmTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
};

export type ChatResult = {
  content: string | null;
  toolCalls?: { id: string; name: string; arguments: string }[];
  finishReason: string;
  /** Total tokens consumed by this call (prompt + completion). 0 if unavailable. */
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export async function chat(
  llmConfig: LlmConfig,
  messages: LlmMessage[],
  tools?: LlmTool[]
): Promise<ChatResult> {
  const client = new OpenAI({
    baseURL: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    defaultHeaders: {}
  });

  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model: llmConfig.modelName,
    messages: messages.map((m) => ({
      role: m.role as any,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {})
    })),
    temperature: llmConfig.temperature,
    max_tokens: llmConfig.maxTokens
  };

  if (tools && tools.length > 0) {
    params.tools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as Record<string, unknown>
      }
    }));
    params.tool_choice = 'auto';
  }

  log.debug(
    `LLM call: ${llmConfig.modelName}, ${messages.length} msgs, ${tools?.length ?? 0} tools`
  );

  const resp = await client.chat.completions.create(params);
  const choice = resp.choices[0];

  if (!choice) {
    log.error(`No choices returned from LLM for model ${llmConfig.modelName}`);
    return {
      content: null,
      finishReason: 'error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }

  const msg = choice.message;
  const usage = resp.usage
    ? {
        promptTokens: resp.usage.prompt_tokens,
        completionTokens: resp.usage.completion_tokens,
        totalTokens: resp.usage.total_tokens
      }
    : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  let toolCalls = msg.tool_calls?.map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments
  }));

  // Some DeepSeek-family models ignore the structured `tools` field and emit
  // their native DSML tool-call format as plain text in `content`. Recovery +
  // stripping is centralised in sanitizeContent(): recover FIRST (only when no
  // structured tool_calls came back), then strip residual markup so nothing
  // leaks to the user as prose (agent-runtime delivers content as an interim
  // note between tool rounds).
  const sanitized = sanitizeContent(msg.content, toolCalls);

  return {
    content: sanitized.content,
    toolCalls: sanitized.toolCalls,
    finishReason: choice.finish_reason ?? 'stop',
    usage
  };
}

/** Same as chat() but streams content deltas via onToken. Tool calls are
 *  accumulated over the stream and returned in the final result just like
 *  the non-streaming variant. DSML markup never reaches `onToken` — see
 *  createDsmlStreamFilter(). */
export async function streamChat(
  llmConfig: LlmConfig,
  messages: LlmMessage[],
  tools: LlmTool[] | undefined,
  onToken: (chunk: string) => void
): Promise<ChatResult> {
  const client = new OpenAI({
    baseURL: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    defaultHeaders: {}
  });

  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model: llmConfig.modelName,
    messages: messages.map((m) => ({
      role: m.role as any,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {})
    })),
    temperature: llmConfig.temperature,
    max_tokens: llmConfig.maxTokens,
    stream: true
  };

  if (tools && tools.length > 0) {
    params.tools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters as Record<string, unknown>
      }
    }));
    params.tool_choice = 'auto';
  }

  log.debug(
    `LLM stream: ${llmConfig.modelName}, ${messages.length} msgs, ${tools?.length ?? 0} tools`
  );

  const stream = await client.chat.completions.create(params);

  let content = '';
  const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {};
  // Filter raw deltas so DSML markup is never streamed to the user token-by-token.
  const dsmlFilter = createDsmlStreamFilter(onToken);

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      content += delta.content;
      dsmlFilter.push(delta.content);
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallAccum[idx]) {
          toolCallAccum[idx] = { id: tc.id ?? '', name: '', arguments: '' };
        }
        const acc = toolCallAccum[idx];
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
      }
    }
  }

  // Flush any prose held back during the stream (and drop unterminated DSML).
  dsmlFilter.flush();

  let toolCalls = Object.values(toolCallAccum);

  // Same recovery + strip pass as chat(), on the fully assembled content. This
  // cleans the RETURNED content (used for persistence); the live stream was
  // already protected by dsmlFilter.
  const sanitized = sanitizeContent(content, toolCalls);
  content = sanitized.content ?? '';
  toolCalls = sanitized.toolCalls;

  return {
    content: content || null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: 'stop',
    // Streaming responses typically don't include usage; these are tracked by
    // the non-streaming `chat()` calls. Add a zero placeholder so the caller
    // can safely accumulate.
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  };
}

// ============================================================
// DSML / tool-call markup handling
// ------------------------------------------------------------
// Some DeepSeek-family models emit their native "DSML" tool-call format as
// plain text inside `content` instead of using the structured tool_calls
// field. DSML uses FULLWIDTH vertical bars U+FF5C, NOT ASCII '|':
//
//   <｜｜DSML｜｜tool_calls>
//   <｜｜DSML｜｜invoke name="run_lark_cli">
//   <｜｜DSML｜｜parameter name="argv" string="false">["calendar","+agenda"]</｜｜DSML｜｜parameter>
//   </｜｜DSML｜｜invoke>
//   </｜｜DSML｜｜tool_calls>
//
// The strip patterns and the parse regexes share a single set of constants
// (DSML_BAR / DSML_BARS) so they can never drift apart — which is what
// previously left the strip matching single bars while the model emits double.
// ============================================================

const DSML_BAR = '｜'; // U+FF5C fullwidth vertical bar
// "1 or 2 fullwidth bars on each side of DSML" — real format is double, single
// is accepted defensively. This source string feeds every DSML regex below.
const DSML_BARS = `${DSML_BAR}{1,2}`;
// Literal opener/closer (double bar) used for indexOf-based streaming detection.
const DSML_OPENER_LITERAL = `<${DSML_BAR}${DSML_BAR}DSML${DSML_BAR}${DSML_BAR}`;
const DSML_CLOSER_LITERAL = `</${DSML_BAR}${DSML_BAR}DSML${DSML_BAR}${DSML_BAR}`;
// Core marker present in every DSML tag, absent from normal prose. Cheap skip.
const DSML_CORE = `${DSML_BAR}DSML`;

// --- Parse regexes (used by parseDsmlToolCalls; each gets its own object so
// global-regex lastIndex state never crosses call sites). ---
const DSML_TOOLCALLS_RE = new RegExp(
  `<${DSML_BARS}DSML${DSML_BARS}tool_calls>[\\s\\S]*?</${DSML_BARS}DSML${DSML_BARS}tool_calls>`,
  'g'
);
const DSML_INVOKE_RE = new RegExp(
  `<${DSML_BARS}DSML${DSML_BARS}invoke\\s+name="([^"]*)"[^>]*>([\\s\\S]*?)</${DSML_BARS}DSML${DSML_BARS}invoke>`,
  'g'
);
// Capture the full attribute region (group 1) so we can read BOTH name and the
// string="true|false" hint, regardless of attribute order.
const DSML_PARAM_RE = new RegExp(
  `<${DSML_BARS}DSML${DSML_BARS}parameter\\s+([^>]*)>([\\s\\S]*?)</${DSML_BARS}DSML${DSML_BARS}parameter>`,
  'g'
);
// Any leftover standalone DSML tag (opener, closer, or orphaned parameter).
const DSML_TAG_RE = new RegExp(`</?${DSML_BARS}DSML${DSML_BARS}[^>]*>`, 'g');

// --- Strip patterns (separate objects from the parse regexes). ---
// Outer-to-inner order so a wrapper consumes its nested tags in one replace.
const TOOL_MARKUP_PATTERNS: RegExp[] = [
  new RegExp(
    `<${DSML_BARS}DSML${DSML_BARS}tool_calls>[\\s\\S]*?</${DSML_BARS}DSML${DSML_BARS}tool_calls>`,
    'g'
  ),
  new RegExp(
    `<${DSML_BARS}DSML${DSML_BARS}invoke[^>]*>[\\s\\S]*?</${DSML_BARS}DSML${DSML_BARS}invoke>`,
    'g'
  ),
  new RegExp(
    `<${DSML_BARS}DSML${DSML_BARS}parameter[^>]*>[\\s\\S]*?</${DSML_BARS}DSML${DSML_BARS}parameter>`,
    'g'
  ),
  new RegExp(`</?${DSML_BARS}DSML${DSML_BARS}[^>]*>`, 'g'),
  // Plain XML tool-call markup some models emit verbatim
  /<invoke\s+name="[^"]*"[^>]*>[\s\S]*?<\/invoke>/g,
  /<parameter\s+name="[^"]*"[^>]*>[\s\S]*?<\/parameter>/g,
  /<tool_calls>[\s\S]*?<\/tool_calls>/g,
  /<function\s+name="[^"]*"[^>]*>[\s\S]*?<\/function>/g
];

/** Strip any leaked tool-call markup from content. Returns the cleaned text
 *  (may be empty string if all content was markup). Does not parse tool calls —
 *  only removes the noise. */
export function stripToolCallMarkup(raw: string): string {
  let cleaned = raw;
  for (const re of TOOL_MARKUP_PATTERNS) {
    cleaned = cleaned.replace(re, '');
  }
  // Collapse runs of whitespace left by removed blocks
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

type ParsedToolCall = { id: string; name: string; arguments: string };

/**
 * Recover DSML tool-call markup leaked into `content`. Returns null when no DSML
 * is present (cheap skip). Honors the `string="false"` attribute: such values
 * are parsed as JSON (arrays/objects/numbers) so recovered args match the shape
 * real API tool_calls deliver — otherwise a recovered `argv` would arrive as a
 * string and silently no-op in executeTool. */
export function parseDsmlToolCalls(raw: string | null): {
  toolCalls: ParsedToolCall[];
  content: string;
} | null {
  if (!raw || !raw.includes(DSML_CORE)) return null;

  const toolCalls: ParsedToolCall[] = [];
  DSML_INVOKE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DSML_INVOKE_RE.exec(raw)) !== null) {
    const args: Record<string, unknown> = {};
    DSML_PARAM_RE.lastIndex = 0;
    let p: RegExpExecArray | null;
    while ((p = DSML_PARAM_RE.exec(m[2])) !== null) {
      const attrs = p[1];
      const rawVal = p[2].trim();
      const nameMatch = attrs.match(/name="([^"]*)"/);
      const name = nameMatch ? nameMatch[1] : '';
      // string="false" → structured value (array/object/number/bool). Parse it
      // so the recovered call carries the right types. string="true" or absent
      // → keep as a plain string.
      if (/string="false"/.test(attrs)) {
        try {
          args[name] = JSON.parse(rawVal);
        } catch {
          args[name] = rawVal; // malformed → fall back to raw string
        }
      } else {
        args[name] = rawVal;
      }
    }
    toolCalls.push({ id: randomUUID(), name: m[1], arguments: JSON.stringify(args) });
  }

  DSML_TOOLCALLS_RE.lastIndex = 0;
  DSML_INVOKE_RE.lastIndex = 0;
  const content = raw
    .replace(DSML_TOOLCALLS_RE, '\n')
    .replace(DSML_INVOKE_RE, '\n')
    .replace(DSML_TAG_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { toolCalls, content };
}

/** Central recovery + strip pass applied to assistant content in both chat()
 *  and streamChat(). Order matters: recover FIRST (only when there are no
 *  structured tool_calls), then strip residual markup. Returns the cleaned
 *  content and the resulting tool-call list. */
function sanitizeContent(
  raw: string | null | undefined,
  existingToolCalls?: { id: string; name: string; arguments: string }[] | undefined
): {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
} {
  let content = raw ?? null;
  let toolCalls = existingToolCalls ? [...existingToolCalls] : [];

  if (!content) return { content, toolCalls };

  // 1) Recovery: lift leaked DSML into real tool calls when none came back.
  if (toolCalls.length === 0) {
    const recovered = parseDsmlToolCalls(content);
    if (recovered) {
      content = recovered.content;
      if (recovered.toolCalls.length > 0) {
        toolCalls = recovered.toolCalls;
        log.warn(
          `recovered ${toolCalls.length} DSML tool call(s) leaked into content: ${toolCalls.map((t) => t.name).join(', ')}`
        );
      } else {
        log.warn('stripped unparsable DSML markup from content');
      }
    }
  }

  // 2) Always strip residual markup (e.g. emitted alongside real tool_calls).
  const cleaned = stripToolCallMarkup(content);
  if (cleaned !== content) {
    log.warn('stripped leaked tool-call markup from content');
    content = cleaned || null;
  }

  return { content, toolCalls };
}

/**
 * Streaming filter that wraps an `onToken` sink so leaked DSML tool-call markup
 * is never forwarded token-by-token to the user.
 *
 * Prose is flushed to `onToken` as soon as it is confirmed safe (typewriter
 * effect preserved). The moment a DSML opener appears — even partially, split
 * across chunks — the filter switches to "hold" mode and buffers the rest. On
 * flush(), held content is cleaned: complete DSML blocks are removed and any
 * surviving prose is emitted; an unterminated block (stream cut mid-markup) is
 * dropped entirely so no fragment reaches the user. This closes the streaming
 * race where post-hoc cleanup fixed the *returned* content but the raw tokens
 * had already been shown live. */
export function createDsmlStreamFilter(onToken: (chunk: string) => void) {
  const OPEN = DSML_OPENER_LITERAL;
  const maxPartial = OPEN.length - 1; // longest tail that could be an opener prefix
  let pending = ''; // unflushed bytes
  let holding = false; // saw an opener → buffer until flush()

  function push(token: string) {
    if (holding) {
      pending += token;
      return;
    }
    pending += token;
    const idx = pending.indexOf(OPEN);
    if (idx !== -1) {
      // Flush prose before the opener, then hold the opener + everything after.
      if (idx > 0) onToken(pending.slice(0, idx));
      pending = pending.slice(idx);
      holding = true;
      return;
    }
    // No opener yet. Flush the safe prefix, but keep any tail that could be the
    // start of an opener (e.g. '<', '<｜', '<｜｜', '<｜｜D', ...).
    let keep = 0;
    for (let k = Math.min(maxPartial, pending.length); k > 0; k--) {
      if (OPEN.startsWith(pending.slice(pending.length - k))) {
        keep = k;
        break;
      }
    }
    const flushUpto = pending.length - keep;
    if (flushUpto > 0) {
      onToken(pending.slice(0, flushUpto));
      pending = pending.slice(flushUpto);
    }
  }

  function flush() {
    if (!holding) {
      // Never saw an opener — pending is plain prose (possibly with a partial
      // opener lookback that never completed). Flush it verbatim.
      if (pending) onToken(pending);
      pending = '';
      return;
    }

    // Holding: pending starts at the first opener. Drop any unterminated tail
    // (an opener with no matching closer — e.g. stream cut by max_tokens) so we
    // never emit DSML fragments, then clean complete blocks and emit surviving prose.
    let buf = pending;
    const cutAt = unterminatedOpenerIndex(buf);
    if (cutAt !== -1) buf = buf.slice(0, cutAt);

    const parsed = parseDsmlToolCalls(buf);
    if (parsed) buf = parsed.content;
    buf = stripToolCallMarkup(buf);

    if (buf.trim()) onToken(buf.replace(/\n{3,}/g, '\n\n').trim());
    pending = '';
    holding = false;
  }

  return { push, flush };
}

/** Index of the opener that begins an unterminated DSML region in `s`, or -1
 *  when every opener has a matching closer (or there is no DSML at all). */
function unterminatedOpenerIndex(s: string): number {
  const openIdxs: number[] = [];
  let i = s.indexOf(DSML_OPENER_LITERAL);
  while (i !== -1) {
    openIdxs.push(i);
    i = s.indexOf(DSML_OPENER_LITERAL, i + 1);
  }
  let closeCount = 0;
  let j = s.indexOf(DSML_CLOSER_LITERAL);
  while (j !== -1) {
    closeCount++;
    j = s.indexOf(DSML_CLOSER_LITERAL, j + 1);
  }
  if (openIdxs.length <= closeCount) return -1; // every opener has a closer
  // The opener at index `closeCount` is the first one without a matching closer.
  return openIdxs[closeCount];
}
