// ============================================================
// Agent policy — per-model resolution of the agent-loop policy.
// Shared by agent-runtime (message path) and proactive-runner
// (trigger / replay path) so both honour the per-model budget
// identically.
// ============================================================

import { config } from '../config';
import type { LoopPolicy } from './agent-loop';

/** Structural slice of an llm_model row — enough to resolve the loop policy.
 *  Keeps this module pure and trivially unit-testable with object literals. */
export type LlmModelPolicyRow = {
  /** Optional per-model override of the agent-loop cumulative token budget.
   *  Null → global default. */
  loopMaxTokens: number | null;
};

/** Resolve the per-turn loop policy for a model. `maxTokens` precedence:
 *  explicit `loopMaxTokens` → global default. Every other field inherits the
 *  global `config.agentLoop` (so per-model only the cost cap moves — wall-clock
 *  and the stuck guards stay global). */
export function resolveLoopPolicy(row: LlmModelPolicyRow): LoopPolicy {
  const maxTokens = row.loopMaxTokens ?? config.agentLoop.maxTokens;
  return { ...config.agentLoop, maxTokens };
}
