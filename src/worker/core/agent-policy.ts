// ============================================================
// Agent policy — per-model resolution of the effective model name
// and the agent-loop policy. Shared by agent-runtime (message path)
// and proactive-runner (trigger / replay path) so both honour the
// 1M-context toggle and per-model budget identically.
// ============================================================

import { config } from '../config';
import type { LoopPolicy } from './agent-loop';

/** Structural slice of an llm_model row — enough to resolve policy. Keeps this
 *  module pure and trivially unit-testable with object literals (no DB). */
export type LlmModelPolicyRow = {
  modelName: string;
  enable1mContext: boolean | null;
  loopMaxTokens: number | null;
};

/** CC Switch-style 1M-context marker appended to the model name so the provider
 *  proxy turns on the 1M context window. */
export const ONE_M_SUFFIX = '[1m]';
/** Case-insensitive "already tagged" detector so a manually-suffixed name (e.g.
 *  `...[1M]` or `...[1m]`) is never double-tagged. */
const ONE_M_MARKER_RE = /\[1m\]/i;

/** Cumulative token budget granted when a model opts into 1M context. 0.6× of a
 *  1M window — leaves headroom for the quadratic history re-send growth while
 *  keeping per-task cost predictable (~20-25 tool-call rounds). */
export const LOOP_MAX_TOKENS_1M_TIER = 600_000;

/** Effective model name sent to the provider. Appends the CC Switch-style `[1m]`
 *  suffix when the model opts into 1M context AND the name doesn't already carry
 *  the marker (case-insensitive), so manually-tagged names aren't double-tagged.
 *  Unchecked / null → name unchanged. */
export function effectiveModelName(row: LlmModelPolicyRow): string {
  const name = row.modelName;
  if (!row.enable1mContext) return name;
  if (ONE_M_MARKER_RE.test(name)) return name;
  return `${name}${ONE_M_SUFFIX}`;
}

/** Resolve the per-turn loop policy for a model. `maxTokens` precedence:
 *  explicit `loopMaxTokens` → 1M-tier (when `enable1mContext`) → global default.
 *  Every other field inherits the global `config.agentLoop` (so per-model only
 *  the cost cap moves — wall-clock and the stuck guards stay global). */
export function resolveLoopPolicy(row: LlmModelPolicyRow): LoopPolicy {
  const maxTokens =
    row.loopMaxTokens ??
    (row.enable1mContext ? LOOP_MAX_TOKENS_1M_TIER : config.agentLoop.maxTokens);
  return { ...config.agentLoop, maxTokens };
}
