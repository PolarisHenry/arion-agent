// ============================================================
// Agent Triggers — types
// ------------------------------------------------------------// Two kinds: 'reminder' (fire-and-send a fixed message, no LLM at fire time)
// and 'task' (run an LLM agent turn with `prompt`). Schedule is one of
// `cron` (recurring) or `fireAt` (one-shot — fires once, then 'completed').
// ============================================================

export type TriggerKind = 'reminder' | 'task';

/** Derived lifecycle: completedAt set → completed; else enabled → active/paused. */
export type TriggerStatus = 'active' | 'paused' | 'completed';

export type AgentTrigger = {
  id: string;
  agentId: string;
  name: string;
  kind: TriggerKind;
  /** Recurring schedule (5-field cron). Null for one-shot triggers. */
  cron: string | null;
  /** One-shot fire instant (ISO). Null for recurring triggers. */
  fireAt: string | null;
  /** task kind: prompt fed to the agent turn. Null for reminders. */
  prompt: string | null;
  /** reminder kind: fixed message sent verbatim. Null for tasks. */
  message: string | null;
  /** Delivery target — chat_id / open_id / etc. (auto-detected by prefix). */
  targetChatId: string | null;
  enabled: boolean;
  /** Set when a one-shot has fired → status 'completed'. */
  completedAt: string | null;
  workdaysOnly: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TriggerMutationPayload = {
  name: string;
  kind?: TriggerKind;
  cron?: string | null;
  fireAt?: string | null;
  prompt?: string | null;
  message?: string | null;
  targetChatId?: string | null;
  enabled?: boolean;
  workdaysOnly?: boolean;
};

/** Derive the lifecycle status from the stored fields. 'completed' beats
 *  'enabled' — a one-shot that fired is done even though enabled is false. */
export function deriveTriggerStatus(trigger: {
  enabled: boolean;
  completedAt: string | null;
}): TriggerStatus {
  if (trigger.completedAt) return 'completed';
  return trigger.enabled ? 'active' : 'paused';
}

/** A trigger joined with its owning agent's name (for the cross-agent overview). */
export type TriggerWithAgent = AgentTrigger & {
  agentName: string;
};
