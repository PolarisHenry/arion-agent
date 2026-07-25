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
