// ============================================================
// Log writer — persists agent execution logs to agent_log table
// ============================================================

import { randomUUID } from 'crypto';
import { workerDb, agentSchema } from '../worker-db';
import { createLogger } from './logger';

const log = createLogger('log-writer');

export type LogEntry = {
  agentId: string;
  ownerId: string;
  chatId?: string;
  type: 'message' | 'trigger' | 'tool';
  messageContent?: string;
  responseContent?: string;
  toolCalls?: { tool: string; args: unknown; result?: string }[];
  tokensUsed?: number;
  durationMs?: number;
  status?: 'success' | 'error';
  error?: string;
};

export async function writeLog(entry: LogEntry): Promise<void> {
  try {
    await workerDb.insert(agentSchema.agentLog).values({
      id: randomUUID(),
      ownerId: entry.ownerId,
      agentId: entry.agentId,
      chatId: entry.chatId ?? null,
      type: entry.type,
      messageContent: entry.messageContent ?? null,
      responseContent: entry.responseContent ?? null,
      toolCalls: entry.toolCalls ?? null,
      tokensUsed: entry.tokensUsed ?? null,
      durationMs: entry.durationMs ?? null,
      status: entry.status ?? 'success',
      error: entry.error ?? null
    });
  } catch (err: any) {
    log.warn(`failed to write log: ${err?.message ?? err}`);
  }
}
