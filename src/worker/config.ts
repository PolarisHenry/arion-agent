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
  // maxToolCallRounds=20. Defaults balance cost control with long-task tolerance.
  // maxRounds is the final fuse; maxTokens (cumulative) is the primary cost cap.
  agentLoop: {
    maxRounds: 100,
    maxTokens: 120_000,
    maxWallMs: 120_000,
    maxConsecutiveErrors: 3,
    maxRepeats: 2
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};
