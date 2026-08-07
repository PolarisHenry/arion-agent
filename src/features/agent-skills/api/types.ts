// ============================================================
// Agent Skills — types
// //------------------------------------------------------------
// A reusable procedure doc an agent can discover (system-prompt
// index) and load on demand, or precipitate from conversation.
//   provenance 'manual'        = dashboard-authored
//                'precipitated' = the agent saved it from a chat
// v1 scope is always 'agent' (private to the owning agent).
// ============================================================

export type SkillProvenance = 'manual' | 'precipitated';

export type AgentSkill = {
  id: string;
  ownerId: string;
  agentId: string;
  name: string;
  description: string;
  body: string;
  /** v1 always 'agent'. Reserved: 'tenant' | 'platform'. */
  scope: string;
  provenance: SkillProvenance;
  /** Chat the skill was precipitated from. Null for manual skills. */
  sourceChatId: string | null;
  enabled: boolean;
  /** Optional platform gate (array of platform ids). Null/empty = all platforms. */
  platforms: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type SkillMutationPayload = {
  name: string;
  description: string;
  body: string;
  enabled: boolean;
};
