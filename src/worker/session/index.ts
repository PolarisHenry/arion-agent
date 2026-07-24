// ============================================================
// Session manager — per-agent chat session persistence
// Stores conversation history in agent_session table.
// ============================================================

import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { createLogger } from '../core/logger';
import { config } from '../config';

const log = createLogger('session');

type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
};

type SessionRow = typeof agentSchema.agentSession.$inferSelect;

export class SessionManager {
  private agentId: string;
  private ownerId: string;

  constructor(agentId: string, ownerId: string) {
    this.agentId = agentId;
    this.ownerId = ownerId;
  }

  /** Load or create a session for (agentId, chatId). */
  async load(chatId: string, chatType: string): Promise<Message[]> {
    const [row] = await workerDb
      .select()
      .from(agentSchema.agentSession)
      .where(
        and(
          eq(agentSchema.agentSession.agentId, this.agentId),
          eq(agentSchema.agentSession.chatId, chatId)
        )
      )
      .limit(1);

    if (!row) {
      return [];
    }

    const msgs = (row.messages as Message[]) ?? [];
    const sanitized = this.sanitize(msgs);
    log.debug(`session loaded: ${chatId} (${msgs.length} → ${sanitized.length} after sanitize)`);
    return sanitized;
  }

  /** Save the full message list back to DB, with truncation if needed. */
  async save(chatId: string, chatType: string, messages: Message[]): Promise<void> {
    // Truncate: keep system prompt + last N user/assistant rounds
    const truncated = this.truncate(messages, config.sessionMaxRounds);

    const [row] = await workerDb
      .select()
      .from(agentSchema.agentSession)
      .where(
        and(
          eq(agentSchema.agentSession.agentId, this.agentId),
          eq(agentSchema.agentSession.chatId, chatId)
        )
      )
      .limit(1);

    if (row) {
      await workerDb
        .update(agentSchema.agentSession)
        .set({
          messages: truncated as any,
          chatType,
          lastActiveAt: new Date()
        })
        .where(eq(agentSchema.agentSession.id, row.id));
    } else {
      await workerDb.insert(agentSchema.agentSession).values({
        id: randomUUID(),
        ownerId: this.ownerId,
        agentId: this.agentId,
        chatId,
        chatType,
        messages: truncated as any,
        lastActiveAt: new Date()
      });
    }

    log.debug(`session saved: ${chatId} (${truncated.length} messages)`);
  }

  /** Delete a session (e.g. user clears context). */
  async clear(chatId: string): Promise<void> {
    const [row] = await workerDb
      .select()
      .from(agentSchema.agentSession)
      .where(
        and(
          eq(agentSchema.agentSession.agentId, this.agentId),
          eq(agentSchema.agentSession.chatId, chatId)
        )
      )
      .limit(1);

    if (row) {
      await workerDb
        .delete(agentSchema.agentSession)
        .where(eq(agentSchema.agentSession.id, row.id));
      log.info(`session cleared: ${chatId}`);
    }
  }

  /** Truncate to the last N rounds. History no longer stores system messages
   *  (the runtime re-injects the prompt each turn), so we only trim the rest —
   *  and we never split an (assistant.tool_calls → tool) pair, which would
   *  orphan a tool message and make the whole history unreplayable. */
  private truncate(messages: Message[], maxRounds: number): Message[] {
    const rest = messages.filter((m) => m.role !== 'system');
    if (rest.length <= maxRounds * 2) return rest;

    let recent = rest.slice(-maxRounds * 2);
    // Drop a leading tool whose requesting assistant was truncated away.
    while (recent.length > 0 && recent[0].role === 'tool') recent = recent.slice(1);
    // Drop a trailing assistant(tool_calls) whose tool results were truncated away.
    while (recent.length > 0) {
      const last = recent[recent.length - 1];
      if (last.role === 'assistant' && last.tool_calls && last.tool_calls.length > 0) {
        recent = recent.slice(0, -1);
      } else {
        break;
      }
    }
    return recent;
  }

  /** Make a loaded history safe to replay: drop system messages (not persisted
   *  here) and any tool message whose tool_call_id has no preceding
   *  assistant(tool_calls). Keeps a corrupt legacy row from permanently
   *  400-ing the agent. */
  private sanitize(messages: Message[]): Message[] {
    const seenToolCallIds = new Set<string>();
    const out: Message[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        if (!m.tool_call_id || !seenToolCallIds.has(m.tool_call_id)) continue;
        out.push(m);
      } else {
        if (m.role === 'assistant' && m.tool_calls) {
          for (const tc of m.tool_calls) if (tc.id) seenToolCallIds.add(tc.id);
        }
        out.push(m);
      }
    }
    return out;
  }
}
