export type AgentStatus = 'active' | 'paused';

export type Agent = {
  id: string;
  ownerId: string | null;
  name: string;
  description: string | null;
  avatar: string | null;
  appId: string;
  appSecretMasked: string;
  larkCliProfile: string;
  systemPrompt: string;
  llmModelId: string;
  llmModelName?: string;
  status: AgentStatus;
  configVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentFilters = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
};

export type AgentsResponse = {
  success: boolean;
  total: number;
  offset: number;
  limit: number;
  agents: Agent[];
};

export type AgentMutationPayload = {
  name: string;
  description?: string;
  avatar?: string;
  appId: string;
  /** Plain, required on create, optional on update. */
  appSecret?: string;
  systemPrompt: string;
  llmModelId: string;
  status?: AgentStatus;
};
