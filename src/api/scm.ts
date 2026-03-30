import { apiFetch, apiJson, apiBaseUrl, ApiError } from '../auth/api';
import type {
  ScmBranchesResponse,
  ScmOAuthStatus,
  ScmProjectConfig,
  ScmProvider,
} from '../types';

export async function fetchProjectScmConfig(projectId: string): Promise<ScmProjectConfig | null> {
  return await apiJson<ScmProjectConfig | null>(`/api/projects/${encodeURIComponent(projectId)}/scm/config`);
}

export async function saveProjectScmConfig(
  projectId: string,
  provider: ScmProvider,
  config: { workspace: string; repoSlug: string }
): Promise<void> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/scm/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, config }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}

export function buildBitbucketOAuthStartUrl(returnTo: string): string {
  const base = apiBaseUrl();
  const url = new URL('/api/scm/bitbucket/oauth/start', base);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

export async function fetchBitbucketOAuthStatus(): Promise<ScmOAuthStatus> {
  return await apiJson<ScmOAuthStatus>('/api/scm/bitbucket/oauth/status');
}

export async function fetchBitbucketBranches(
  projectId: string,
  options?: { q?: string }
): Promise<ScmBranchesResponse> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/scm/bitbucket/branches`;
  const q = options?.q?.trim();
  const url = q ? `${path}?q=${encodeURIComponent(q)}` : path;
  return await apiJson<ScmBranchesResponse>(url);
}

export async function createBitbucketBranch(
  projectId: string,
  name: string,
  baseBranch: string
): Promise<{ name: string; url: string }> {
  return await apiJson<{ name: string; url: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/scm/bitbucket/branches`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, baseBranch }),
    }
  );
}

export async function createBitbucketPullRequest(
  projectId: string,
  payload: {
    sourceBranch: string;
    destinationBranch: string;
    title: string;
    description?: string;
  }
): Promise<{ id: string; title: string; url: string }> {
  return await apiJson<{ id: string; title: string; url: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/scm/bitbucket/pullrequests`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
