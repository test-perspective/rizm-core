import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, StorageData } from '../types';
import {
  createEntity,
  getDefaultManifest,
  isAiFallbackForced,
  isBackendEnabled,
  loadDataAsync,
  mergeEntity,
  saveDataAsync,
  updateEntity,
} from './storage';

describe('storage utils', () => {
  const originalEnv = process.env.VITE_KEEL_BACKEND_URL;
  const originalAiForceFallback = process.env.VITE_KEEL_AI_FORCE_FALLBACK;

  beforeEach(() => {
    // Default: backend not configured.
    process.env.VITE_KEEL_BACKEND_URL = '';
    process.env.VITE_KEEL_AI_FORCE_FALLBACK = '';
  });

  afterEach(() => {
    process.env.VITE_KEEL_BACKEND_URL = originalEnv;
    process.env.VITE_KEEL_AI_FORCE_FALLBACK = originalAiForceFallback;
    vi.restoreAllMocks();
  });

  it('getDefaultManifest returns expected defaults', () => {
    const m = getDefaultManifest();
    expect(m.name).toBe('Task Manager');
    expect(m.defaultView).toBe('table');
    const taskEntity = m.entities.find((e) => e.id === 'task');
    expect(taskEntity?.id).toBe('task');
    expect(taskEntity?.name).toBe('Task');
    expect(taskEntity?.properties.map((p) => p.name)).toEqual([
      'taskKey',
      'title',
      'status',
      'priority',
      'assigneeId',
      'Description',
      'link',
      'parentTaskKey',
      'blockedBy',
      'labels',
    ]);
  });

  it('getDefaultManifest includes labels in table, backlog, and board visibleProperties', () => {
    const m = getDefaultManifest();
    const table = m.views.find((v) => v.id === 'table');
    const backlog = m.views.find((v) => v.id === 'backlog');
    const board = m.views.find((v) => v.id === 'board');
    expect(table?.visibleProperties).toContain('labels');
    expect(backlog?.visibleProperties).toContain('labels');
    expect(board?.visibleProperties).toContain('labels');
  });

  it('mergeEntity picks the newer updatedAt (LWW)', () => {
    const existing: Entity = { id: '1', entityId: 'task', createdAt: 1, updatedAt: 10, properties: { title: 'old' } };
    const incoming: Entity = { id: '1', entityId: 'task', createdAt: 1, updatedAt: 11, properties: { title: 'new' } };
    expect(mergeEntity(existing, incoming).properties.title).toBe('new');
    expect(mergeEntity(incoming, existing).properties.title).toBe('new');
  });

  it('createEntity sets id + timestamps', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000001');

    const e = createEntity('task', { title: 'x' });
    expect(e.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(e.entityId).toBe('task');
    expect(e.createdAt).toBe(1_000_000);
    expect(e.updatedAt).toBe(1_000_000);
    expect(e.properties).toEqual({ title: 'x' });
  });

  it('updateEntity merges properties and bumps updatedAt', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000_000);

    const base: Entity = { id: '1', entityId: 'task', createdAt: 10, updatedAt: 20, properties: { a: 1, b: 2 } };
    const updated = updateEntity(base, { b: 999, c: 3 });
    expect(updated.createdAt).toBe(10);
    expect(updated.updatedAt).toBe(2_000_000);
    expect(updated.entityId).toBe('task');
    expect(updated.properties).toEqual({ a: 1, b: 999, c: 3 });
  });

  it('loadDataAsync throws when backend is not configured', async () => {
    expect(isBackendEnabled()).toBe(false);
    await expect(loadDataAsync()).rejects.toThrow('Backend is not configured (VITE_KEEL_BACKEND_URL).');
  });

  it('loadDataAsync uses backend GET when env is set', async () => {
    process.env.VITE_KEEL_BACKEND_URL = 'http://example.test';
    expect(isBackendEnabled()).toBe(true);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        version: 9,
        activeProjectId: 'p1',
        projects: [
          {
            id: 'p1',
            name: 'Project 1',
            createdAt: 1,
            updatedAt: 1,
            entities: [],
            config: { manifest: getDefaultManifest() },
          },
        ],
      }),
    })) as any;
    vi.stubGlobal('fetch', fetchMock);

    const data = await loadDataAsync();
    expect(fetchMock).toHaveBeenCalledWith('http://example.test/state', { credentials: 'include' });
    expect(data.version).toBe(9);
    expect(data.projects).toHaveLength(1);
    const active = data.projects.find((p) => p.id === data.activeProjectId) ?? data.projects[0];
    expect(active.config.manifest.name).toBe('Task Manager');
  });

  it('isAiFallbackForced returns false by default', () => {
    expect(isAiFallbackForced()).toBe(false);
  });

  it('isAiFallbackForced returns true for truthy strings', () => {
    process.env.VITE_KEEL_AI_FORCE_FALLBACK = 'true';
    expect(isAiFallbackForced()).toBe(true);
    process.env.VITE_KEEL_AI_FORCE_FALLBACK = '1';
    expect(isAiFallbackForced()).toBe(true);
    process.env.VITE_KEEL_AI_FORCE_FALLBACK = 'on';
    expect(isAiFallbackForced()).toBe(true);
    process.env.VITE_KEEL_AI_FORCE_FALLBACK = 'yes';
    expect(isAiFallbackForced()).toBe(true);
  });

  it('saveDataAsync uses backend PUT when env is set', async () => {
    process.env.VITE_KEEL_BACKEND_URL = 'http://example.test';
    expect(isBackendEnabled()).toBe(true);

    const fetchMock = vi.fn(async () => ({ ok: true })) as any;
    vi.stubGlobal('fetch', fetchMock);

    const payload: StorageData = {
      version: 1,
      activeProjectId: 'p1',
      projects: [
        {
          id: 'p1',
          name: 'Project 1',
          createdAt: 1,
          updatedAt: 1,
          entities: [],
          config: { manifest: getDefaultManifest() },
        },
      ],
    };
    await saveDataAsync(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://example.test/state');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify(payload));
  });
});

