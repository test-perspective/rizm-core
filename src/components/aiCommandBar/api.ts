import { apiFetch, apiJson, ApiError } from '../../auth/api';
import type { ProjectManifest } from '../../types';

export type ManifestVersionSummary = {
  id: string;
  projectId: string;
  createdAt: number;
  actorUserId?: string;
  source: string;
  message?: string;
  parentId?: string;
};

export type ManifestVersionDetail = ManifestVersionSummary & {
  manifest: ProjectManifest;
};

export const fetchManifestVersions = async (projectId: string): Promise<ManifestVersionSummary[]> => {
  return apiJson<ManifestVersionSummary[]>(
    `/api/projects/${encodeURIComponent(projectId)}/manifest/versions?limit=50&offset=0`
  );
};

export const fetchManifestVersion = async (
  projectId: string,
  versionId: string
): Promise<ManifestVersionDetail> => {
  return apiJson<ManifestVersionDetail>(
    `/api/projects/${encodeURIComponent(projectId)}/manifest/versions/${encodeURIComponent(versionId)}`
  );
};

export const revertManifestVersion = async (projectId: string, versionId: string): Promise<void> => {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/manifest/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
};

export const deleteManifestVersion = async (projectId: string, versionId: string): Promise<void> => {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/manifest/versions/${encodeURIComponent(versionId)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
};

export const clearManifestHistory = async (projectId: string): Promise<void> => {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/manifest/versions/clear`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
};
