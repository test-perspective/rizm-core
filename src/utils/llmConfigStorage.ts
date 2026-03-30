export type AiProvider = 'ollama' | 'deepseek' | 'openrouter';

export type LlmConfig = {
  provider: AiProvider;
  model?: string;
  deepseekApiKey?: string;
  openrouterApiKey?: string;
};

const LLM_STORAGE_KEYS = {
  provider: 'keel_ai_provider',
  model: 'keel_ai_model',
  modelDeepseek: 'keel_ai_model_deepseek',
  modelOpenrouter: 'keel_ai_model_openrouter',
  modelOllama: 'keel_ai_model_ollama',
  deepseekApiKey: 'keel_deepseek_api_key',
  openrouterApiKey: 'keel_openrouter_api_key',
} as const;

function getModelKeyForProvider(provider: AiProvider): string {
  switch (provider) {
    case 'deepseek':
      return LLM_STORAGE_KEYS.modelDeepseek;
    case 'openrouter':
      return LLM_STORAGE_KEYS.modelOpenrouter;
    case 'ollama':
      return LLM_STORAGE_KEYS.modelOllama;
  }
}

export function getStoredModelForProvider(provider: AiProvider): string | undefined {
  const key = getModelKeyForProvider(provider);
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    return raw.trim() || undefined;
  }
  const legacy = localStorage.getItem(LLM_STORAGE_KEYS.model)?.trim();
  return legacy || undefined;
}

export function getStoredLlmConfig(): LlmConfig {
  const provider = (localStorage.getItem(LLM_STORAGE_KEYS.provider)?.trim().toLowerCase() ||
    'deepseek') as AiProvider;
  const effectiveProvider = ['openrouter', 'ollama', 'deepseek'].includes(provider)
    ? provider
    : 'deepseek';
  const model = getStoredModelForProvider(effectiveProvider);
  const deepseekApiKey = localStorage.getItem(LLM_STORAGE_KEYS.deepseekApiKey)?.trim() || undefined;
  const openrouterApiKey =
    localStorage.getItem(LLM_STORAGE_KEYS.openrouterApiKey)?.trim() || undefined;
  return {
    provider: effectiveProvider,
    model: model || undefined,
    deepseekApiKey,
    openrouterApiKey,
  };
}

export function setStoredLlmConfig(config: LlmConfig): void {
  try {
    localStorage.setItem(LLM_STORAGE_KEYS.provider, config.provider);
    const modelKey = getModelKeyForProvider(config.provider);
    localStorage.setItem(modelKey, config.model ?? '');
    localStorage.setItem(LLM_STORAGE_KEYS.deepseekApiKey, config.deepseekApiKey ?? '');
    localStorage.setItem(LLM_STORAGE_KEYS.openrouterApiKey, config.openrouterApiKey ?? '');
  } catch {
    // ignore
  }
}

export function getLlmDisplayLabel(config: LlmConfig): string {
  const model = config.model || 'default';
  return `${config.provider}/${model}`;
}
