import { apiFetch, ApiError } from '../auth/api';
import type { Entity } from '../types';

function getEtag(res: Response): string {
  const etag = res.headers.get('etag') ?? res.headers.get('ETag');
  if (!etag) throw new Error('Missing ETag header');
  return etag;
}

export async function getEntityApi(
  projectId: string,
  entityPk: string
): Promise<{ entity: Entity; etag: string }> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityPk)}`, {
    method: 'GET',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const entity = (await res.json()) as Entity;
  return { entity, etag: getEtag(res) };
}

export async function createEntityApi(
  projectId: string,
  id: string,
  entityId: string,
  properties: Record<string, unknown>
): Promise<{ entity: Entity; etag: string }> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/entities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, entityId, properties }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const entity = (await res.json()) as Entity;
  return { entity, etag: getEtag(res) };
}

export async function patchEntityApi(
  projectId: string,
  entityPk: string,
  patch: Record<string, unknown>,
  etag: string
): Promise<{ entity: Entity; etag: string }> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityPk)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify({ patch }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const entity = (await res.json()) as Entity;
  return { entity, etag: getEtag(res) };
}

export async function deleteEntityApi(projectId: string, entityPk: string, etag: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityPk)}`, {
    method: 'DELETE',
    headers: { 'If-Match': etag },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}

