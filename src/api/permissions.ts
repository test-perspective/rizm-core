import { apiFetch, apiJson, ApiError } from '../auth/api';
import type { ProjectPolicy, UserGroup } from '../auth/types';

export async function fetchProjectPolicy(projectId: string): Promise<ProjectPolicy> {
  return await apiJson<ProjectPolicy>(`/api/projects/${encodeURIComponent(projectId)}/policy`);
}

export async function updateProjectPolicy(projectId: string, policy: ProjectPolicy): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/policy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}

export async function fetchUserGroups(): Promise<UserGroup[]> {
  return await apiJson<UserGroup[]>('/api/permissions/groups');
}

export async function createUserGroup(name: string, description?: string): Promise<UserGroup> {
  const res = await apiFetch('/api/permissions/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return await res.json();
}

export async function updateUserGroup(id: string, name: string, description?: string): Promise<UserGroup> {
  const res = await apiFetch(`/api/permissions/groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  return await res.json();
}

export async function deleteUserGroup(id: string): Promise<void> {
  const res = await apiFetch(`/api/permissions/groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}

export async function getGroupMembers(groupId: string): Promise<string[]> {
  return await apiJson<string[]>(`/api/permissions/groups/${encodeURIComponent(groupId)}/members`);
}

export async function addUserToGroup(groupId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/api/permissions/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}

export async function removeUserFromGroup(groupId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/api/permissions/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}

export async function checkPermission(projectId: string): Promise<{ canRead: boolean; canWrite: boolean }> {
  const params = new URLSearchParams({ project_id: projectId });
  return await apiJson<{ canRead: boolean; canWrite: boolean }>(`/api/permissions/check?${params.toString()}`);
}
