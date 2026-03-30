import { apiJson } from '../auth/api';

export type OpenRouterModel = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

export type OpenRouterModelsResponse = {
  data?: OpenRouterModel[];
  [key: string]: unknown;
};

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const data = await apiJson<OpenRouterModelsResponse>('/api/ai/openrouter-models');
  const arr = data?.data ?? (Array.isArray(data) ? data : []);
  return arr as OpenRouterModel[];
}
