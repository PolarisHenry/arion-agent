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

export type Message = {
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
    const sanitized = sanitizeHistory(msgs);
    log.debug(`session loaded: ${chatId} (${msgs.length} → ${sanitized.length} after sanitize)`);
    return sanitized;
  }

  /** Save the full message list back to DB, with truncation if needed. */
  async save(chatId: string, chatType: string, messages: Message[]): Promise<void> {
    // Two-stage truncation: coarse (round-based) + fine (token-budget).
    const truncated = this.truncate(messages, config.sessionMaxRounds, config.sessionMaxTokens);

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

  /** Two-stage truncation: (1) keep last N rounds, (2) if still over the
   *  estimated token budget, degrade old tool results to PLACEHOLDER-level
   *  one-liners — same fidelity-drop strategy as the agent loop's Layer 2.
   *  Never touches user or assistant messages (those are semantically
   *  load-bearing). Never splits an (assistant.tool_calls → tool) pair. */
  private truncate(messages: Message[], maxRounds: number, maxTokens: number): Message[] {
    const rest = messages.filter((m) => m.role !== 'system');

    // --- Stage 1: round-based coarse cut ---
    let recent = rest;
    if (recent.length > maxRounds * 2) {
      recent = recent.slice(-maxRounds * 2);
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
    }

    // --- Stage 2: token-budget fine cut ---
    // Cheap heuristic: ~4 chars ≈ 1 token (CJK-dense text averages higher;
    // 4 is conservative — it over-counts slightly, trimming earlier).
    const estTokens = recent.reduce((sum, m) => sum + m.content.length / 4, 0);
    if (estTokens <= maxTokens) return recent;

    // Walk backwards from the oldest message, degrading tool results until
    // the budget fits. User and assistant messages are never touched — their
    // content is structurally needed for conversation coherence.
    const result = [...recent];
    let budget = estTokens;
    for (let i = 0; i < result.length && budget > maxTokens; i++) {
      const m = result[i];
      if (m.role !== 'tool') continue;
      if (m.content.length < 100) continue; // already tiny
      const saved = m.content.length / 4 - 30; // ~30 tokens for the placeholder
      m.content = `[ARCHIVED] ${m.name || 'tool'} (${m.content.length.toLocaleString()} 字符)`;
      budget -= saved;
    }

    return result;
  }
}

/** Make a loaded history safe to replay against the chat API.
 *
 *  Two corruption modes are repaired (both 400 the API otherwise):
 *  (1) FORWARD orphan — an assistant(tool_calls) whose tool results were
 *      partially lost (e.g. a prior agent-loop bug broke mid-batch). The API
 *      rejects this as "insufficient tool messages following tool_calls
 *      message". Fix: drop the assistant(tool_calls) and its partial results.
 *  (2) REVERSE orphan — a tool message whose requesting assistant(tool_calls)
 *      was truncated away. Fix: drop the tool message.
 *
 *  Well-formed history passes through unchanged. Pure — unit-tested directly. */
export function sanitizeHistory(messages: Message[]): Message[] {
  // Every tool_call_id that has at least one tool result anywhere in the list.
  const answered = new Set<string>();
  for (const m of messages) {
    if (m.role === 'tool' && m.tool_call_id) answered.add(m.tool_call_id);
  }

  const out: Message[] = [];
  // Ids claimed by a KEPT assistant(tool_calls). A tool message is replayed
  // only when its parent batch was kept, so we never emit an orphan tool.
  const claimed = new Set<string>();
  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'tool') {
      if (m.tool_call_id && claimed.has(m.tool_call_id)) out.push(m);
      continue;
    }

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      // Keep the batch only when EVERY id has a result — a partial batch is
      // dropped wholesale, since keeping half would still 400 the API.
      const fullyAnswered = m.tool_calls.every((tc) => Boolean(tc.id) && answered.has(tc.id));
      if (!fullyAnswered) continue;
      for (const tc of m.tool_calls) if (tc.id) claimed.add(tc.id);
    }

    out.push(m);
  }
  return out;
}
