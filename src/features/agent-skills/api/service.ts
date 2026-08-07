import { apiBaseUrl, assertOk } from '@/lib/api-client';
import type { AgentSkill, SkillMutationPayload } from './types';

export async function getSkills(agentId: string): Promise<AgentSkill[]> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/skills`);
  await assertOk(res);
  const data = await res.json();
  return data.skills as AgentSkill[];
}

export async function createSkill(
  agentId: string,
  values: SkillMutationPayload
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values)
  });
  await assertOk(res);
  return res.json();
}

export async function updateSkill(
  agentId: string,
  skillId: string,
  values: Partial<SkillMutationPayload>
): Promise<{ success: boolean }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/skills/${skillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values)
  });
  await assertOk(res);
  return res.json();
}

export async function deleteSkill(agentId: string, skillId: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${apiBaseUrl()}/api/agents/${agentId}/skills/${skillId}`, {
    method: 'DELETE'
  });
  await assertOk(res);
  return res.json();
}
