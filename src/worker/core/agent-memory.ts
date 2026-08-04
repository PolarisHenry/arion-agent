// ============================================================
// Agent memory — persistent per-agent KV facts.
// renderMemorySection is PURE (unit-tested here). DB ops live below
// and use workerDb; the dashboard API routes duplicate the queries
// with the app `db` (the worker and app use separate clients — same
// pattern as agent_log: worker writes via writeLog, app reads inline).
// ============================================================

import { randomUUID } from 'crypto';
import { eq, and, desc, or, isNull, gt } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';

export type MemoryFact = {
  id: string;
  key: string;
  value: string;
  label: string | null;
  category: string | null;
  note: string | null;
  importance: string;
  expiresAt: Date | null;
  updatedAt: Date;
};

const IMP_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const MAX_FACTS = 200;
const MAX_SECTION_CHARS = 12000;

/** Pure: render memory facts into a system-prompt section. Empty → ''.
 *  Sorts by importance descending (high > medium > low), then newest-first
 *  within each tier. Expired facts are excluded. Capped at 200 facts / 12KB. */
export function renderMemorySection(facts: MemoryFact[]): string {
  if (facts.length === 0) return '';
  const now = new Date();
  const active = facts.filter((f) => !f.expiresAt || f.expiresAt > now);
  if (active.length === 0) return '';
  const sorted = [...active].sort((a, b) => {
    const ia = IMP_ORDER[a.importance] ?? 1;
    const ib = IMP_ORDER[b.importance] ?? 1;
    if (ia !== ib) return ia - ib;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const lines: string[] = [];
  let truncated = false;
  for (const f of sorted) {
    if (lines.length >= MAX_FACTS) {
      truncated = true;
      break;
    }
    const cat = f.category ? `[${f.category}] ` : '';
    const label = f.label ?? f.key;
    const val = f.value.length > 80 ? `${f.value.slice(0, 77)}…` : f.value;
    const note = f.note ? `（${f.note}）` : '';
    lines.push(`- ${cat}${label}: ${val}${note}`);
    if (lines.join('\n').length > MAX_SECTION_CHARS) {
      truncated = true;
      break;
    }
  }
  const header =
    '## 已记下的信息（长期记忆，/clear 不会丢）\n（若以下任何一条与你本轮掌握的最新事实矛盾或已过时，请用 memory save 同 key 覆盖更新，或 memory delete 清理，别留着错信息误导自己。）';
  const footer = truncated ? '\n（更多请用 memory list 查看）' : '';
  return `\n\n${header}\n${lines.join('\n')}${footer}`;
}

// -----------------------------------------------------------
// DB ops (workerDb) — save / get / list / delete / load
// -----------------------------------------------------------

const MAX_VALUE_CHARS = 4096;

export type SaveMemoryInput = {
  agentId: string;
  ownerId: string;
  key: string;
  value: string;
  label?: string;
  category?: string;
  note?: string;
  importance?: string;
  expiresAt?: string;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

function toFact(row: typeof agentSchema.agentMemory.$inferSelect): MemoryFact {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    label: row.label,
    category: row.category,
    note: row.note,
    importance: row.importance ?? 'medium',
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt
  };
}

/** Upsert a fact by (agentId, key). Validates before touching the DB. */
export async function saveMemoryFact(input: SaveMemoryInput): Promise<SaveResult> {
  const key = input.key.trim();
  if (!key) return { ok: false, error: 'key is required' };
  if (!input.value) return { ok: false, error: 'value is required' };
  if (input.value.length > MAX_VALUE_CHARS)
    return { ok: false, error: `value too long (max ${MAX_VALUE_CHARS} chars)` };

  if (input.importance && !['high', 'medium', 'low'].includes(input.importance))
    return { ok: false, error: 'importance must be high, medium, or low' };

  const label = input.label ?? null;
  const category = input.category ?? null;
  const note = input.note ?? null;
  const importance = input.importance ?? 'medium';
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && isNaN(expiresAt.getTime()))
    return { ok: false, error: 'expiresAt must be a valid ISO-8601 timestamp' };

  await workerDb
    .insert(agentSchema.agentMemory)
    .values({
      id: randomUUID(),
      ownerId: input.ownerId,
      agentId: input.agentId,
      key,
      value: input.value,
      label,
      category,
      note,
      importance,
      expiresAt
    })
    .onConflictDoUpdate({
      target: [agentSchema.agentMemory.agentId, agentSchema.agentMemory.key],
      set: { value: input.value, label, category, note, importance, expiresAt }
    });
  return { ok: true };
}

export async function getMemoryFact(agentId: string, key: string): Promise<MemoryFact | null> {
  const [row] = await workerDb
    .select()
    .from(agentSchema.agentMemory)
    .where(and(eq(agentSchema.agentMemory.agentId, agentId), eq(agentSchema.agentMemory.key, key)))
    .limit(1);
  return row ? toFact(row) : null;
}

/** List facts for the agent-facing `memory list` tool. Same non-expired scope
 *  as loadMemoryFacts (injection) — the agent must never see a fact in its list
 *  that's silently absent from its prompt. The dashboard reads via its own route
 *  (app `db`) and still shows expired facts for audit. */
export async function listMemoryFacts(agentId: string, category?: string): Promise<MemoryFact[]> {
  const now = new Date();
  const conditions = [
    eq(agentSchema.agentMemory.agentId, agentId),
    or(isNull(agentSchema.agentMemory.expiresAt), gt(agentSchema.agentMemory.expiresAt, now))
  ];
  if (category) conditions.push(eq(agentSchema.agentMemory.category, category));
  const rows = await workerDb
    .select()
    .from(agentSchema.agentMemory)
    .where(and(...conditions))
    .orderBy(desc(agentSchema.agentMemory.updatedAt));
  return rows.map(toFact);
}

export async function deleteMemoryFact(agentId: string, key: string): Promise<boolean> {
  const deleted = await workerDb
    .delete(agentSchema.agentMemory)
    .where(and(eq(agentSchema.agentMemory.agentId, agentId), eq(agentSchema.agentMemory.key, key)))
    .returning({ id: agentSchema.agentMemory.id });
  return deleted.length > 0;
}

/** Load non-expired facts for system-prompt injection. Sorted by importance
 *  (high → medium → low) then newest-first within each tier. The render side
 *  also caps at 200 entries / 12KB. */
export async function loadMemoryFacts(agentId: string): Promise<MemoryFact[]> {
  const now = new Date();
  const rows = await workerDb
    .select()
    .from(agentSchema.agentMemory)
    .where(
      and(
        eq(agentSchema.agentMemory.agentId, agentId),
        or(isNull(agentSchema.agentMemory.expiresAt), gt(agentSchema.agentMemory.expiresAt, now))
      )
    )
    .orderBy(desc(agentSchema.agentMemory.updatedAt));
  return rows.map(toFact);
}
