import { Entity, Project, ProjectManifest, StorageData } from '../types';
import { randomUUID } from './uuid';

const WIKI_ENTITY_ID = 'wikiPage';
const WIKI_VIEW_ID_BASE = 'wiki';

const pickUniqueId = (base: string, taken: Set<string>): string => {
  let id = base;
  let i = 1;
  while (taken.has(id)) {
    id = `${base}-${i}`;
    i += 1;
  }
  return id;
};

export const ensureWikiInManifest = (manifest: ProjectManifest): ProjectManifest => {
  let changed = false;
  let entities = manifest.entities;
  let views = manifest.views;

  const wikiEntityIndex = entities.findIndex((e) => e.id === WIKI_ENTITY_ID);
  if (wikiEntityIndex === -1) {
    entities = [
      ...entities,
      {
        id: WIKI_ENTITY_ID,
        name: 'Notes Page',
        namePlural: 'Notes Pages',
        properties: [
          { name: 'title', type: 'text', visible: true },
          // Stored as JSON stringified BlockNote `editor.document`.
          { name: 'doc', type: 'text', visible: false },
        ],
        titleLikeProperty: 'title',
      },
    ];
    changed = true;
  } else {
    const existing = entities[wikiEntityIndex];
    const props = existing.properties ?? [];
    const hasTitle = props.some((p) => p.name === 'title');
    const hasDoc = props.some((p) => p.name === 'doc');
    const needsTitleLike = existing.titleLikeProperty !== 'title';
    if (!hasTitle || !hasDoc || needsTitleLike) {
      const nextProps = [...props];
      if (!hasTitle) nextProps.push({ name: 'title', type: 'text', visible: true });
      if (!hasDoc) nextProps.push({ name: 'doc', type: 'text', visible: false });
      entities = entities.map((e, idx) =>
        idx === wikiEntityIndex
          ? { ...e, properties: nextProps, titleLikeProperty: 'title' as const }
          : e
      );
      changed = true;
    }
  }

  const hasWikiView = views.some((v) => v.type === 'wiki');
  if (!hasWikiView) {
    const viewIds = new Set(views.map((v) => v.id));
    const id = pickUniqueId(WIKI_VIEW_ID_BASE, viewIds);
    views = [
      ...views,
      {
        id,
        name: 'Notes',
        type: 'wiki',
        entityId: WIKI_ENTITY_ID,
        visibleProperties: ['title'],
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
    ];
    changed = true;
  }

  if (!changed) return manifest;
  return { ...manifest, entities, views };
};

const normalizeLoopbackBaseUrl = (base: string): string => {
  // Avoid SameSite/Lax surprises: treat localhost and 127.0.0.1 as equivalent and
  // align with current page hostname when possible.
  try {
    const u = new URL(base);
    const host = u.hostname;
    const pageHost = globalThis.location?.hostname;
    if (!pageHost) return base;

    const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1';
    if (isLoopback(host) && isLoopback(pageHost) && host !== pageHost) {
      u.hostname = pageHost;
      return u.toString().replace(/\/$/, '');
    }
    return base;
  } catch {
    return base;
  }
};
const getBackendUrlFromEnv = (): string | undefined => {
  const v =
    ((globalThis as any).process?.env?.VITE_KEEL_BACKEND_URL as unknown) ??
    ((import.meta as any).env?.VITE_KEEL_BACKEND_URL as unknown);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return normalizeLoopbackBaseUrl(trimmed);
};

const getBackendUrlFromSameOrigin = (): string | undefined => {
  // For production (same-origin deployment), allow omitting VITE_KEEL_BACKEND_URL.
  // In that case, the backend is expected to be reachable on the same origin via reverse proxy.
  try {
    const origin = globalThis.location?.origin;
    if (typeof origin !== 'string') return undefined;
    const trimmed = origin.trim();
    if (!trimmed || trimmed === 'null') return undefined;
    return trimmed.replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

const getAiForceFallbackFromEnv = (): boolean => {
  const v =
    ((globalThis as any).process?.env?.VITE_KEEL_AI_FORCE_FALLBACK as unknown) ??
    ((import.meta as any).env?.VITE_KEEL_AI_FORCE_FALLBACK as unknown);
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return false;
  const normalized = v.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const isProdBuild = (): boolean => {
  try {
    return (import.meta as any).env?.PROD === true;
  } catch {
    return false;
  }
};

const backendConfigured = (): boolean => {
  const url = getBackendUrlFromEnv();
  if (typeof url === 'string' && url.trim().length > 0) return true;
  // Only enable same-origin fallback for production builds.
  if (!isProdBuild()) return false;
  return typeof getBackendUrlFromSameOrigin() === 'string';
};

export const isBackendEnabled = (): boolean => backendConfigured();
export const getBackendUrl = (): string | undefined =>
  getBackendUrlFromEnv() ?? (isProdBuild() ? getBackendUrlFromSameOrigin() : undefined);
export const isAiFallbackForced = (): boolean => getAiForceFallbackFromEnv();

export const getDefaultManifest = (): ProjectManifest =>
  ensureWikiInManifest({
    name: 'Task Manager',
    entities: [
      {
        id: 'task',
        name: 'Task',
        namePlural: 'Tasks',
        properties: [
          { name: 'taskKey', type: 'text', visible: true },
          { name: 'title', type: 'text', visible: true },
          { name: 'status', type: 'select', options: ['Backlog', 'Todo', 'In Progress', 'Done'], visible: true },
          { name: 'priority', type: 'select', options: ['Low', 'Medium', 'High'], visible: true },
          { name: 'assigneeId', type: 'user', visible: true },
          { name: 'Description', type: 'richtext', visible: true },
          { name: 'link', type: 'link', visible: true },
          { name: 'labels', type: 'labels', visible: true },
        ],
        defaultView: 'list',
        titleLikeProperty: 'title',
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'task',
        visibleProperties: ['taskKey', 'title', 'status', 'priority', 'assigneeId', 'link', 'labels'],
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
      {
        id: 'backlog',
        name: 'Backlog',
        type: 'board',
        entityId: 'task',
        groupBy: 'status',
        visibleProperties: ['taskKey', 'title', 'priority', 'assigneeId', 'labels'],
        hiddenColumns: ['Todo', 'In Progress', 'Done'],
      },
      {
        id: 'board',
        name: 'Board',
        type: 'board',
        entityId: 'task',
        groupBy: 'status',
        visibleProperties: ['title', 'priority', 'assigneeId', 'labels'],
        hiddenColumns: ['Backlog'],
      },
    ],
    defaultView: 'table',
  });

const normalizeStorageData = (raw: any): StorageData => {
  // Current shape
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray(raw.projects) &&
    typeof raw.activeProjectId === 'string' &&
    typeof raw.version === 'number'
  ) {
    const projects: Project[] = (raw.projects as Project[]).map((p: any) => {
      try {
        const manifest = p?.config?.manifest as ProjectManifest | undefined;
        if (!manifest) return p as Project;
        const nextManifest = ensureWikiInManifest(manifest);
        if (nextManifest === manifest) return p as Project;
        return { ...p, config: { ...p.config, manifest: nextManifest } } as Project;
      } catch {
        // Be conservative: if anything is malformed, leave it untouched.
        return p as Project;
      }
    });
    const activeProjectId: string = raw.activeProjectId;
    if (projects.length === 0) {
      throw new Error('Invalid state: projects is empty');
    }
    const activeExists = projects.some((p) => p.id === activeProjectId);
    return {
      projects,
      activeProjectId: activeExists ? activeProjectId : projects[0].id,
      version: raw.version,
    };
  }

  throw new Error('Invalid state shape');
};

export const loadDataAsync = async (): Promise<StorageData> => {
  const base = getBackendUrl();
  if (!base) {
    throw new Error('Backend is not configured (VITE_KEEL_BACKEND_URL).');
  }

  const res = await fetch(`${base}/state`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load state: ${res.status}`);
  const raw = await res.json();
  return normalizeStorageData(raw);
};

export const saveDataAsync = async (data: StorageData): Promise<void> => {
  const base = getBackendUrl();
  if (!base) {
    throw new Error('Backend is not configured (VITE_KEEL_BACKEND_URL).');
  }

  const res = await fetch(`${base}/state`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to save state: ${res.status}`);
};

export const mergeEntity = (existing: Entity, incoming: Entity): Entity => {
  return incoming.updatedAt > existing.updatedAt ? incoming : existing;
};

export const createEntity = (entityId: string, properties: Record<string, any>): Entity => {
  const now = Date.now();
  return {
    id: randomUUID(),
    entityId,
    createdAt: now,
    updatedAt: now,
    properties,
  };
};

export const updateEntity = (entity: Entity, properties: Record<string, any>): Entity => {
  return {
    ...entity,
    updatedAt: Date.now(),
    properties: {
      ...entity.properties,
      ...properties,
    },
  };
};
