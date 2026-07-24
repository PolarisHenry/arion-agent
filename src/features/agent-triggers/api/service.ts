import { apiBaseUrl, assertOk } from '@/lib/api-client';
import type { AgentTrigger, TriggerMutationPayload, TriggerWithAgent } from './types';

export async function getTriggers(agentId: string): Promise<AgentTrigger[]> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/triggers`);
  await assertOk(res);
  const data = await res.json();
  return data.triggers as AgentTrigger[];
}

export async function getAllTriggers(): Promise<TriggerWithAgent[]> {
  const res = await fetch(`${apiBaseUrl()}/api/triggers`);
  await assertOk(res);
  const data = await res.json();
  return data.triggers as TriggerWithAgent[];
}

export async function createTrigger(
  agentId: string,
  values: TriggerMutationPayload
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values)
  });
  await assertOk(res);
  return res.json();
}

export async function updateTrigger(
  agentId: string,
  triggerId: string,
  values: Partial<TriggerMutationPayload>
): Promise<{ updated: boolean }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/triggers/${triggerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteTrigger(
  agentId: string,
  triggerId: string
): Promise<{ deleted: boolean }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/triggers/${triggerId}`, {
    method: 'DELETE'
  });
  await assertOk(res);
  return res.json();
}
