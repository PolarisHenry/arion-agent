// ============================================================
// Worker config — reads env, .env, and provides shared utils
// ============================================================

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://arion:arion_dev@localhost:5432/arion_agent',
  encryptionKey: process.env.SECRET_ENCRYPTION_KEY || '',
  larkCliPath: process.env.LARK_CLI_PATH || './node_modules/.bin/lark-cli',
  // Display/business timezone — the single project-wide setting (default
  // Beijing). Read here at config-creation time (after dotenv loads .env) so a
  // value in .env takes effect; the dashboard reads the same var via
  // src/lib/timezone.ts (inlined into the client bundle at build). Drives LLM
  // "current time" injection AND scheduler cron evaluation.
  agentTimezone:
    process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.AGENT_TIMEZONE || 'Asia/Shanghai',
  pollIntervalMs: Number(process.env.CONFIG_POLL_INTERVAL_MS) || 30_000,
  sessionMaxRounds: 20,
  /** Max estimated tokens in a persisted session. When exceeded, older
   *  messages are trimmed (char-count heuristic: ~4 chars ≈ 1 token for CJK,
   *  so 80k chars ≈ 20k tokens). Preserves user+assistant messages; degrades
   *  tool results first (they're the dominant cost). Env-tunable. */
  sessionMaxTokens: Number(process.env.SESSION_MAX_TOKENS) || 20_000,
  // ---- Agent-loop context-cost guard rails -----------------------------------
  // Three-layer graduated pipeline, cheapest first (industry pattern:
  // every production agent system uses this — Claude Code, Anthropic SDK,
  // Shopify Sidekick). Layer 1 + 2 are pure string ops (zero API cost);
  // Layer 3 (LLM compaction) is reserved for when 1+2 aren't enough.
  //
  // Layer 1 — Observation Mask: structured truncation with a metadata
  //   header (tool / command / status / size) so the model knows exactly
  //   what was truncated and why. Replaces naive head+tail cutting.
  // Layer 2 — Progressive Fidelity Drop: three-tiers (FULL / MASKED /
  //   PLACEHOLDER) driven by recency. Only degrades tool messages — user
  //   and assistant content is never touched (protects the prompt cache
  //   prefix too, since DeepSeek auto-caches the unchanged prefix).
  // Layer 3 — LLM Compaction: reserved, not yet wired. A single cheap-model
  //   API call that summarises old message blocks. Only when 1+2 aren't
  //   enough (JetBrains NeurIPS 2025: masking already beats summarization).
  /** Layer 1: max chars of a tool result before structured truncation. */
  toolResultMaxChars: Number(process.env.TOOL_RESULT_MAX_CHARS) || 8000,
  /** Layer 2: rounds older than this → tool results demoted from FULL to MASKED. */
  maskToolResultsAfterRounds: 3,
  /** Layer 2: rounds older than this → tool results demoted from MASKED to PLACEHOLDER. */
  archiveToolResultsAfterRounds: 6,
  // Agent loop policy — resource caps and stuck guards replace the old hardcoded
  // maxToolCallRounds=20. These are the GLOBAL DEFAULTS (used when a model
  // doesn't override via llm_model.loop_max_tokens — see resolveLoopPolicy).
  // Env-tunable so ops can adjust without a code change.
  //   maxTokens  cumulative input+output across all rounds of one turn. This is
  //              a COST cap, NOT the model's context window — it's a running sum,
  //              and since history is re-sent each round it grows fast. 600k buys
  //              ~20-25 tool-call rounds on a long-context model (the old 120k
  //              gave only ~7-8, which is why long tasks kept hitting the budget
  //              and forcing the "回复继续" wrap-up).
  //   maxWallMs  whole-turn wall-clock cap. Raised to 5min so subprocess-heavy
  //              lark-cli tasks aren't cut off mid-work.
  //   maxRounds  hard fuse — rarely binds (token-budget catches first).
  // maxRepeats / maxConsecutiveErrors are stuck guards (no-progress → stop),
  // not resource caps, so they stay fixed.
  agentLoop: {
    maxRounds: Number(process.env.AGENT_LOOP_MAX_ROUNDS) || 100,
    maxTokens: Number(process.env.AGENT_LOOP_MAX_TOKENS) || 600_000,
    maxWallMs: Number(process.env.AGENT_LOOP_MAX_WALL_MS) || 300_000,
    maxConsecutiveErrors: 3,
    maxRepeats: 2
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};
