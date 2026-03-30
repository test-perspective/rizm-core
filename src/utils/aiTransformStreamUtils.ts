import type { ProjectManifest } from '../types';
import { parseProjectManifest } from './manifestValidation';

export type ScmConfigFromAi = { workspace: string; repoSlug: string };

export type AiProgressStreamEvent =
  | { type: 'phase'; message: string }
  | { type: 'toolCall'; name: string }
  | { type: 'llmOutput'; text: string }
  | { type: 'result'; manifest: ProjectManifest; scmConfig?: ScmConfigFromAi }
  | { type: 'error'; message: string };

export type AiTransformStreamResult = {
  manifest: ProjectManifest;
  scmConfig?: ScmConfigFromAi;
};

export const readNdjsonStream = async (
  res: Response,
  onEvent: (event: AiProgressStreamEvent) => void
): Promise<AiTransformStreamResult> => {
  if (!res.body) {
    throw new Error('Stream body is missing.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as AiProgressStreamEvent;
      onEvent(event);
      if (event.type === 'error') {
        throw new Error(event.message || 'AI transform failed.');
      }
      if (event.type === 'result') {
        try {
          return {
            manifest: parseProjectManifest(event.manifest),
            scmConfig: event.scmConfig,
          };
        } finally {
          reader.cancel().catch(() => {});
        }
      }
    }
  }
  throw new Error('AI transform stream ended without result.');
};
