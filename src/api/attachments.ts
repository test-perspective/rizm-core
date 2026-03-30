import { apiFetch, ApiError } from '../auth/api';
import type { Entity } from '../types';

function getEtag(res: Response): string {
  const etag = res.headers.get('etag') ?? res.headers.get('ETag');
  if (!etag) throw new Error('Missing ETag header');
  return etag;
}

export async function fetchAttachmentBlobApi(
  projectId: string,
  entityPk: string,
  attachmentId: string
): Promise<Blob> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityPk)}/attachments/${encodeURIComponent(
      attachmentId
    )}`,
    { method: 'GET' }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return await res.blob();
}

export async function uploadAttachmentsApi(
  projectId: string,
  entityPk: string,
  files: File[]
): Promise<{ entity: Entity; etag: string }> {
  const form = new FormData();
  for (const f of files) {
    form.append('file', f, f.name);
  }

  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityPk)}/attachments`,
    {
      method: 'POST',
      body: form,
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const entity = (await res.json()) as Entity;
  return { entity, etag: getEtag(res) };
}

export async function deleteAttachmentApi(
  projectId: string,
  entityPk: string,
  attachmentId: string
): Promise<{ entity: Entity; etag: string }> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityPk)}/attachments/${encodeURIComponent(
      attachmentId
    )}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const entity = (await res.json()) as Entity;
  return { entity, etag: getEtag(res) };
}

