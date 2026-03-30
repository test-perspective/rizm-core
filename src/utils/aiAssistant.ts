import { getBackendUrl, isBackendEnabled } from './storage';
import type { AiHistoryMessage } from './aiHistory';
import type { LlmConfig } from './aiTransform';

export type AiAssistantProgressEvent =
  | { type: 'user'; message: string }
  | { type: 'phase'; message: string }
  | { type: 'toolCall'; name: string }
  | { type: 'llmOutput'; text: string }
  | { type: 'result'; message?: string }
  | { type: 'error'; message: string };

export const askRizmAssistantStream = async (
  input: string,
  projectId: string | undefined,
  llmConfig: LlmConfig,
  history: AiHistoryMessage[] | undefined,
  onProgress: (event: AiAssistantProgressEvent) => void,
  signal?: AbortSignal
): Promise<string> => {
  if (!isBackendEnabled()) {
    throw new Error('Backend is not enabled (VITE_KEEL_BACKEND_URL not set)');
  }
  const base = getBackendUrl();
  if (!base) throw new Error('Backend URL is missing');

  const body = {
    input,
    projectId: projectId ?? '',
    history: (history ?? []).map((item) => ({ role: item.role, content: item.content })),
    provider: llmConfig.provider,
    model: llmConfig.model,
    deepseekApiKey: llmConfig.deepseekApiKey ?? '',
    openrouterApiKey: llmConfig.openrouterApiKey ?? '',
  };

  const res = await fetch(`${base}/api/ai/chat-stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI chat failed: ${res.status} ${msg}`);
  }

  if (!res.body) {
    throw new Error('Stream body is missing.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalMessage = '';
  let gotChatResult = false;

  const processLine = (trimmed: string) => {
    if (!trimmed) return;
    const raw = JSON.parse(trimmed) as { type: string; message?: string; name?: string; text?: string };
    if (raw.type === 'phase' && raw.message) {
      onProgress({ type: 'phase', message: raw.message });
    } else if (raw.type === 'toolCall' && raw.name) {
      onProgress({ type: 'toolCall', name: raw.name });
    } else if (raw.type === 'llmOutput' && raw.text) {
      onProgress({ type: 'llmOutput', text: raw.text });
    } else if (raw.type === 'chatResult' && raw.message !== undefined) {
      finalMessage = raw.message;
      gotChatResult = true;
      onProgress({ type: 'result', message: raw.message });
    } else if (raw.type === 'error' && raw.message) {
      onProgress({ type: 'error', message: raw.message });
      throw new Error(raw.message || 'AI assistant failed.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      for (const line of buffer.split('\n')) {
        processLine(line.trim());
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line.trim());
      if (gotChatResult) break;
    }
    if (gotChatResult) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return finalMessage;
};

export const askRizmAssistant = async (
  input: string,
  projectId: string,
  llmConfig: LlmConfig,
  history?: AiHistoryMessage[]
): Promise<string> => {
  if (!isBackendEnabled()) {
    throw new Error('Backend is not enabled (VITE_KEEL_BACKEND_URL not set)');
  }
  const base = getBackendUrl();
  if (!base) throw new Error('Backend URL is missing');

  const body = {
    input,
    projectId,
    history: (history ?? []).map((item) => ({ role: item.role, content: item.content })),
    provider: llmConfig.provider,
    model: llmConfig.model,
    deepseekApiKey: llmConfig.deepseekApiKey ?? '',
    openrouterApiKey: llmConfig.openrouterApiKey ?? '',
  };

  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI chat failed: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as any;
  return String(data?.message ?? '');
};
