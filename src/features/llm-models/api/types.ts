export type LlmProvider = 'deepseek' | 'openai' | 'qwen' | 'kimi' | 'custom';

export type LlmModel = {
  id: string;
  ownerId: string | null;
  name: string;
  provider: LlmProvider;
  baseUrl: string;
  /** Masked preview only — the plain key is never sent to the client. */
  apiKeyMasked: string;
  modelName: string;
  temperature: number | null;
  maxTokens: number | null;
  /** Optional per-model override of the agent-loop cumulative token budget.
   *  Null → global default. */
  loopMaxTokens: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LlmModelFilters = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
};

export type LlmModelsResponse = {
  success: boolean;
  total: number;
  offset: number;
  limit: number;
  models: LlmModel[];
};

export type LlmModelMutationPayload = {
  name: string;
  provider: LlmProvider;
  baseUrl: string;
  /** Plain key. Required on create; optional on update (omit = keep current). */
  apiKey?: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  loopMaxTokens?: number | null;
  isActive?: boolean;
};

/** Provider → default baseUrl presets, used by the form to auto-fill. */
export const LLM_PROVIDER_PRESETS: {
  provider: LlmProvider;
  baseUrl: string;
  label: string;
}[] = [
  { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', label: 'DeepSeek' },
  { provider: 'openai', baseUrl: 'https://api.openai.com/v1', label: 'OpenAI' },
  {
    provider: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    label: 'Qwen'
  },
  { provider: 'kimi', baseUrl: 'https://api.moonshot.cn/v1', label: 'Kimi' },
  { provider: 'custom', baseUrl: '', label: 'Custom' }
];
