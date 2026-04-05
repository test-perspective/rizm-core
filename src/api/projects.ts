import { ApiError, apiJson, apiFetch } from '../auth/api';
import type {
  MoveWikiPageResponse,
  Project,
  ProjectsIndexResponse,
  ProjectStateResponse,
  WikiPageMeta,
  WikiPageResponse,
} from '../types';

export async function fetchProjectsIndex(): Promise<ProjectsIndexResponse> {
  return await apiJson<ProjectsIndexResponse>('/api/projects');
}

export async function fetchProjectKeySuggestion(name: string): Promise<string> {
  const params = new URLSearchParams({ name });
  const res = await apiJson<{ projectKey: string }>(`/api/projects/key-suggestion?${params.toString()}`);
  return res.projectKey;
}

export async function fetchProjectKeyAvailability(key: string): Promise<boolean> {
  const params = new URLSearchParams({ key });
  const res = await apiJson<{ available: boolean }>(`/api/projects/key-availability?${params.toString()}`);
  return res.available;
}

export async function fetchProjectState(projectId: string): Promise<ProjectStateResponse> {
  return await apiJson<ProjectStateResponse>(`/api/projects/${encodeURIComponent(projectId)}/state`);
}

export async function saveProjectState(project: Project): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(project.id)}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function fetchWikiPage(projectId: string, pageId: string): Promise<WikiPageResponse> {
  return await apiJson<WikiPageResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/wiki/pages/${encodeURIComponent(pageId)}`
  );
}

export async function saveWikiCollabState(
  projectId: string,
  pageId: string,
  payload: { doc: string; crdtBlob: number[] }
): Promise<WikiPageResponse> {
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/wiki/pages/${encodeURIComponent(pageId)}/collab`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return (await res.json()) as WikiPageResponse;
}

export async function fetchWikiPages(projectId: string): Promise<WikiPageMeta[]> {
  return await apiJson<WikiPageMeta[]>(
    `/api/projects/${encodeURIComponent(projectId)}/wiki/pages`
  );
}

export async function moveWikiPage(
  projectId: string,
  pageId: string,
  body: {
    destinationProjectId: string;
    destinationParentId?: string | null;
    beforePageId?: string | null;
  }
): Promise<MoveWikiPageResponse> {
  const payload: Record<string, unknown> = {
    destinationProjectId: body.destinationProjectId,
    destinationParentId: body.destinationParentId ?? null,
    beforePageId: body.beforePageId ?? null,
  };
  return await apiJson<MoveWikiPageResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/wiki/pages/${encodeURIComponent(pageId)}/move`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteProjectApi(projectId: string): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

