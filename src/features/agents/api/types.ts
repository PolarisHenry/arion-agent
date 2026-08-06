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
  /** Which platform this agent binds to. */
  platform: 'lark' | 'wechat';
  /** WeChat-only identity/status. botId/ilinkUserId for display; needsReauth
   *  when the session expired (-14) and a re-scan is required. */
  platformConfig?: {
    botId?: string;
    ilinkUserId?: string;
    needsReauth?: boolean;
  } | null;
  /** WeChat only: id of the linked Lark agent whose Feishu identity is borrowed. */
  linkedAgentId?: string | null;
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
