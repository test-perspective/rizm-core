import type { ProjectManifest } from '../types';
import { getBackendUrl, isBackendEnabled } from './storage';
import { parseProjectManifest } from './manifestValidation';
import type { AiHistoryMessage } from './aiHistory';
import {
  type AiProvider,
  type LlmConfig,
  getStoredModelForProvider,
  getStoredLlmConfig,
  setStoredLlmConfig,
  getLlmDisplayLabel,
} from './llmConfigStorage';
import { predefinedTransformations, getManifestForTransformationInput } from './aiTransformPresets';
import {
  readNdjsonStream,
  type AiProgressStreamEvent,
  type AiTransformStreamResult,
  type ScmConfigFromAi,
} from './aiTransformStreamUtils';

export type { AiProvider, LlmConfig };
export { getStoredModelForProvider, getStoredLlmConfig, setStoredLlmConfig, getLlmDisplayLabel };
export { predefinedTransformations, getManifestForTransformationInput };
export type { AiProgressStreamEvent, AiTransformStreamResult, ScmConfigFromAi };

export const transformManifestWithTools = async (
  input: string,
  currentManifest: ProjectManifest | undefined,
  projectId: string | undefined,
  deepseekApiKey?: string,
  history?: AiHistoryMessage[]
): Promise<ProjectManifest> => {
  if (!isBackendEnabled()) {
    throw new Error('Backend is not enabled (VITE_KEEL_BACKEND_URL not set)');
  }
  const base = getBackendUrl();
  if (!base) throw new Error('Backend URL is missing');

  const res = await fetch(`${base}/api/ai/transform-tools`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      currentManifest,
      projectId: projectId?.trim() ? projectId : undefined,
      deepseekApiKey: deepseekApiKey ?? '',
      history: (history ?? []).map((item) => ({ role: item.role, content: item.content })),
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI transform (tools) failed: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as any;
  return parseProjectManifest(data?.manifest ?? data);
};

export type AiTransformConversationProgressEvent =
  | { type: 'phase'; message: string }
  | { type: 'toolCall'; name: string }
  | { type: 'llmOutput'; text: string }
  | { type: 'result'; message?: string }
  | { type: 'error'; message: string };

export const transformConversationStream = async (
  input: string,
  currentManifest: ProjectManifest | undefined,
  projectId: string | undefined,
  llmConfig: LlmConfig,
  history: AiHistoryMessage[] | undefined,
  onProgress: (event: AiTransformConversationProgressEvent) => void,
  signal?: AbortSignal
): Promise<string> => {
  if (!isBackendEnabled()) {
    throw new Error('Backend is not enabled (VITE_KEEL_BACKEND_URL not set)');
  }
  const base = getBackendUrl();
  if (!base) throw new Error('Backend URL is missing');

  const body: Record<string, unknown> = {
    input,
    currentManifest,
    projectId: projectId?.trim() ? projectId : undefined,
    history: (history ?? []).map((item) => ({ role: item.role, content: item.content })),
    provider: llmConfig.provider,
    model: llmConfig.model,
    deepseekApiKey: llmConfig.deepseekApiKey ?? '',
    openrouterApiKey: llmConfig.openrouterApiKey ?? '',
  };

  const res = await fetch(`${base}/api/ai/transform-conversation-stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI transform conversation failed: ${res.status} ${msg}`);
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
      throw new Error(raw.message || 'AI transform conversation failed.');
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

export const transformManifestWithToolsStream = async (
  input: string,
  currentManifest: ProjectManifest | undefined,
  projectId: string | undefined,
  llmConfig: LlmConfig,
  history: AiHistoryMessage[] | undefined,
  onEvent: (event: AiProgressStreamEvent) => void,
  signal?: AbortSignal
): Promise<AiTransformStreamResult> => {
  if (!isBackendEnabled()) {
    throw new Error('Backend is not enabled (VITE_KEEL_BACKEND_URL not set)');
  }
  const base = getBackendUrl();
  if (!base) throw new Error('Backend URL is missing');

  const body: Record<string, unknown> = {
    input,
    currentManifest,
    projectId: projectId?.trim() ? projectId : undefined,
    history: (history ?? []).map((item) => ({ role: item.role, content: item.content })),
    provider: llmConfig.provider,
    model: llmConfig.model,
    deepseekApiKey: llmConfig.deepseekApiKey ?? '',
    openrouterApiKey: llmConfig.openrouterApiKey ?? '',
  };

  const res = await fetch(`${base}/api/ai/transform-tools-stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`AI transform (tools) failed: ${res.status} ${msg}`);
  }
  return readNdjsonStream(res, onEvent);
};