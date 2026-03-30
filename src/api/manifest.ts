import { apiFetch, ApiError } from '../auth/api';
import type { ProjectManifest } from '../types';

export interface PutManifestOptions {
  source?: string;
  message?: string;
}

export async function putManifestApi(
  projectId: string,
  manifest: ProjectManifest,
  etag: string,
  options?: PutManifestOptions
): Promise<string> {
  const body: { manifest: ProjectManifest; source?: string; message?: string } = { manifest };
  if (options?.source) {
    body.source = options.source;
  }
  if (options?.message) {
    body.message = options.message;
  }
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/manifest`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  const next = res.headers.get('etag') ?? res.headers.get('ETag');
  if (!next) throw new Error('Missing ETag header');
  return next.replace(/^W\//, '');
}

