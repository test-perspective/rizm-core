import { apiJson, apiFetch } from '../auth/api';
import type { UserSummary } from '../types';

/**
 * Search users by email (partial match, case-insensitive).
 * Returns up to `limit` results (default 20).
 */
export async function searchUsersApi(query: string, limit = 20): Promise<UserSummary[]> {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set('q', query.trim());
  }
  params.set('limit', String(limit));
  return await apiJson<UserSummary[]>(`/api/users/search?${params.toString()}`);
}

/**
 * Resolve specific user IDs to their summary info.
 * Only returns users that exist and are not disabled.
 */
export async function resolveUsersApi(ids: string[]): Promise<UserSummary[]> {
  if (ids.length === 0) return [];
  
  const res = await apiFetch('/api/users/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  
  if (!res.ok) {
    throw new Error(`Failed to resolve users: ${res.status}`);
  }
  
  return (await res.json()) as UserSummary[];
}
