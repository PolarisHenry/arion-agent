// ============================================================
// Skill source — agent-own skills persisted as DB rows. Progressive
// disclosure: buildSkillIndex renders the slim per-turn index
// (name + description) injected into the system prompt; the full body
// is read on demand via the `skill` tool's load action.
//
// DbSkillSource is the sole source (agent-own rows, read each turn).
// The registry is kept as a thin seam so additional sources can be
// wired in later without changing the skill tool or prompt builder.
// ============================================================

import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { workerDb, agentSchema } from '../worker-db';
import { createLogger } from './logger';

const log = createLogger('skill-source');

export type SkillScope = 'platform' | 'agent';
export type SkillProvenance = 'builtin' | 'precipitated' | 'manual';

export interface ArionSkill {
  name: string;
  description: string;
  body: string;
  scope: SkillScope;
  provenance: SkillProvenance;
  enabled: boolean;
  /** Platforms this skill applies to. Empty/undefined → all platforms. */
  platforms?: string[];
}

export interface SkillSource {
  readonly id: string;
  listForAgent(agentId: string, ownerId: string): Promise<ArionSkill[]>;
}

// -----------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------

/** Render the per-turn system-prompt index: a `## 技能` section, one
 *  `- name: description` line per skill. Empty → ''. Pure. */
export function buildSkillIndex(skills: ArionSkill[]): string {
  if (skills.length === 0) return '';
  const lines = skills.map((s) => `- \`${s.name}\`: ${s.description}`);
  return `\n\n## 技能（按需加载：判断相关时调 skill 工具 load 该名字读正文）\n${lines.join('\n')}`;
}

/** Drop skills whose platform gate excludes the given platform. Pure. */
export function filterByPlatform(skills: ArionSkill[], platform: string): ArionSkill[] {
  return skills.filter(
    (s) => !s.platforms || s.platforms.length === 0 || s.platforms.includes(platform)
  );
}

/** Merge multiple sources. On name collision the EARLIER source wins —
 *  register platform (file) before agent (db) so platform is authoritative. */
export function mergeSkills(sources: ArionSkill[][]): ArionSkill[] {
  const seen = new Set<string>();
  const out: ArionSkill[] = [];
  for (const list of sources) {
    for (const s of list) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push(s);
    }
  }
  return out;
}

// -----------------------------------------------------------
// DB ops (workerDb) — save / update / list for agent-own skills.
// -----------------------------------------------------------

const SKILL_NAME_RE = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*$/;
const MAX_SKILL_NAME = 64;
const MAX_DESC = 300;
const MAX_BODY = 8000;

export function isValidSkillName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_SKILL_NAME && SKILL_NAME_RE.test(name);
}

export type SaveSkillInput = {
  agentId: string;
  ownerId: string;
  name: string;
  description: string;
  body: string;
  provenance?: SkillProvenance;
  sourceChatId?: string;
};
export type SaveSkillResult = { ok: true; name: string } | { ok: false; error: string };

/** Upsert an agent-private skill by (agentId, name). Validates before touching DB. */
export async function saveAgentSkill(input: SaveSkillInput): Promise<SaveSkillResult> {
  const name = input.name.trim();
  if (!isValidSkillName(name)) {
    return {
      ok: false,
      error: 'name must be lowercase snake_case/kebab-case (a-z 0-9 _ - .), e.g. weekly_report'
    };
  }
  const description = input.description.trim();
  if (!description) return { ok: false, error: 'description is required' };
  if (description.length > MAX_DESC)
    return { ok: false, error: `description too long (max ${MAX_DESC} chars)` };
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'body is required' };
  if (body.length > MAX_BODY) return { ok: false, error: `body too long (max ${MAX_BODY} chars)` };

  try {
    await workerDb
      .insert(agentSchema.agentSkill)
      .values({
        id: randomUUID(),
        ownerId: input.ownerId,
        agentId: input.agentId,
        name,
        description,
        body,
        scope: 'agent',
        provenance: input.provenance ?? 'manual',
        sourceChatId: input.sourceChatId ?? null,
        enabled: true
      })
      .onConflictDoUpdate({
        target: [agentSchema.agentSkill.agentId, agentSchema.agentSkill.name],
        set: { description, body }
      });
    return { ok: true, name };
  } catch (err: any) {
    log.error(`saveAgentSkill failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? 'db error' };
  }
}

/** Update an agent's own private skill's description and/or body. Name is
 *  immutable here (renames are dashboard-only). Returns ok:false if the skill
 *  doesn't exist for this agent (covers the platform-builtin case — those have
 *  no DB row, so update naturally can't touch them). */
export async function updateAgentSkill(
  agentId: string,
  name: string,
  patch: { description?: string; body?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const updates: Record<string, unknown> = {};
  if (patch.description !== undefined) {
    const d = patch.description.trim();
    if (!d) return { ok: false, error: 'description cannot be empty' };
    if (d.length > MAX_DESC)
      return { ok: false, error: `description too long (max ${MAX_DESC} chars)` };
    updates.description = d;
  }
  if (patch.body !== undefined) {
    const b = patch.body.trim();
    if (!b) return { ok: false, error: 'body cannot be empty' };
    if (b.length > MAX_BODY) return { ok: false, error: `body too long (max ${MAX_BODY} chars)` };
    updates.body = b;
  }
  if (Object.keys(updates).length === 0) return { ok: false, error: 'no fields to update' };

  try {
    const updated = await workerDb
      .update(agentSchema.agentSkill)
      .set(updates)
      .where(
        and(eq(agentSchema.agentSkill.agentId, agentId), eq(agentSchema.agentSkill.name, name))
      )
      .returning({ id: agentSchema.agentSkill.id });
    if (updated.length === 0) {
      return {
        ok: false,
        error: `未找到技能 ${name}（或不属于本智能体；平台内置技能不能 update）`
      };
    }
    return { ok: true };
  } catch (err: any) {
    log.error(`updateAgentSkill failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? 'db error' };
  }
}

function rowToSkill(row: typeof agentSchema.agentSkill.$inferSelect): ArionSkill {
  return {
    name: row.name,
    description: row.description,
    body: row.body,
    scope: row.scope === 'platform' ? 'platform' : 'agent',
    provenance: (row.provenance as SkillProvenance) ?? 'manual',
    enabled: row.enabled,
    platforms: Array.isArray(row.platforms) ? (row.platforms as string[]) : undefined
  };
}

/** DB source — agent-private skills (enabled only). The visible set is the
 *  agent's own rows; ownerId is the tenant guard (rows are already scoped by
 *  agentId which is tenant-unique). */
export class DbSkillSource implements SkillSource {
  readonly id = 'db';

  async listForAgent(agentId: string, _ownerId: string): Promise<ArionSkill[]> {
    try {
      const rows = await workerDb
        .select()
        .from(agentSchema.agentSkill)
        .where(
          and(eq(agentSchema.agentSkill.agentId, agentId), eq(agentSchema.agentSkill.enabled, true))
        );
      return rows.map(rowToSkill);
    } catch (err: any) {
      log.warn(`DbSkillSource read failed: ${err?.message ?? err}`);
      return [];
    }
  }
}

// -----------------------------------------------------------
// Registry — sources registered at worker boot. The skill tool and
// prompt builder resolve an agent's skills through here.
// -----------------------------------------------------------

const sources: SkillSource[] = [];

export function registerSkillSource(source: SkillSource): void {
  if (!sources.some((s) => s.id === source.id)) sources.push(source);
}

export function resetSkillSources(): void {
  sources.length = 0;
}

/** All skills visible to this agent, merged across registered sources. */
export async function listSkillsForAgent(agentId: string, ownerId: string): Promise<ArionSkill[]> {
  const lists = await Promise.all(sources.map((s) => s.listForAgent(agentId, ownerId)));
  return mergeSkills(lists);
}

/** Find a skill by name across the agent's visible set. */
export async function findSkillForAgent(
  agentId: string,
  ownerId: string,
  name: string
): Promise<ArionSkill | undefined> {
  const all = await listSkillsForAgent(agentId, ownerId);
  return all.find((s) => s.name === name);
}

/** Build the per-turn system-prompt index for an agent: visible skills,
 *  enabled, platform-gated. Empty → ''. */
export async function loadSkillIndex(
  agentId: string,
  ownerId: string,
  platform: string
): Promise<string> {
  const all = await listSkillsForAgent(agentId, ownerId);
  const visible = filterByPlatform(
    all.filter((s) => s.enabled),
    platform
  );
  return buildSkillIndex(visible);
}
