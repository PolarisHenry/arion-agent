// ============================================================
// Agent Triggers — types
// ============================================================

export type AgentTrigger = {
  id: string;
  agentId: string;
  name: string;
  cron: string;
  prompt: string;
  targetChatId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TriggerMutationPayload = {
  name: string;
  cron: string;
  prompt: string;
  targetChatId?: string | null;
  enabled?: boolean;
};

/** A trigger joined with its owning agent's name (for the cross-agent overview). */
export type TriggerWithAgent = AgentTrigger & {
  agentName: string;
};
