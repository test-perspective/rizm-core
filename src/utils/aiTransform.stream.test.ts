import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformManifestWithToolsStream } from './aiTransform';
import type { ProjectManifest } from '../types';

vi.mock('./storage', () => ({
  isBackendEnabled: () => true,
  getBackendUrl: () => 'http://localhost:48888',
}));

const buildManifest = (): ProjectManifest => ({
  name: 'Demo',
  entities: [
    {
      id: 'task',
      name: 'Task',
      namePlural: 'Tasks',
      properties: [{ name: 'title', type: 'text', visible: true }],
      defaultView: 'table',
    },
  ],
  views: [
    {
      id: 'table',
      name: 'Table',
      type: 'table',
      entityId: 'task',
      visibleProperties: ['title'],
    },
  ],
  defaultView: 'table',
});

describe('transformManifestWithToolsStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses NDJSON events and returns manifest', async () => {
    const manifest = buildManifest();
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode(JSON.stringify({ type: 'phase', message: 'Starting' }) + '\n'),
      encoder.encode(JSON.stringify({ type: 'result', manifest }) + '\n'),
    ];
    let readIndex = 0;
    const reader = {
      read: async () => {
        if (readIndex >= chunks.length) {
          return { done: true, value: undefined as unknown as Uint8Array };
        }
        return { done: false, value: chunks[readIndex++] };
      },
      cancel: async () => {},
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
      text: async () => '',
    } as Response);
    globalThis.fetch = fetchMock;

    const events: Array<{ type: string }> = [];
    const result = await transformManifestWithToolsStream(
      'Make a demo project',
      manifest,
      undefined,
      { provider: 'deepseek', deepseekApiKey: 'sk-test' },
      [],
      (event) => events.push(event)
    );

    expect(result.manifest.name).toBe('Demo');
    expect(events.some((e) => e.type === 'phase')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/ai/transform-tools-stream'),
      expect.any(Object)
    );
  });
});
