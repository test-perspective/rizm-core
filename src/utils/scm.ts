import type { Entity, ScmBranchInfo, ScmProvider, ScmPullRequestInfo } from '../types';

export const SCM_INTEGRATION_ENTITY_ID = 'scmIntegration';

export type BranchPrefix = 'bugfix' | 'feature' | 'hotfix' | 'release' | 'other' | 'none';

export function getTaskKey(entity: Entity): string {
  const raw = entity.properties?.taskKey;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function getEntityTitle(entity: Entity): string {
  const raw = entity.properties?.title;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'Untitled';
}

export function buildBranchName(prefix: BranchPrefix, taskKey: string, title: string): string {
  const base = `${taskKey} ${title}`.trim();
  if (prefix === 'none') return base;
  return `${prefix}/${base}`.trim();
}

export function sanitizeBranchName(raw: string): string {
  let name = raw.trim();
  if (!name) return '';
  name = name.replace(/\\/g, '/');
  name = name.replace(/@\{/g, '@-');
  name = name.replace(/[~^:?*\\[\]]/g, '-');
  name = name.replace(/\.\./g, '.');
  name = name.replace(/\/{2,}/g, '/');
  name = name.replace(/\/+$/g, '');
  name = name.replace(/^\//g, '');
  name = name.replace(/\.+$/g, '');
  return name;
}

export function toScmBranchInfo(
  provider: ScmProvider,
  repo: { workspace: string; repoSlug: string },
  name: string,
  url: string
): ScmBranchInfo {
  return {
    provider,
    repo,
    name,
    url,
  };
}

export function toScmPullRequestInfo(
  provider: ScmProvider,
  repo: { workspace: string; repoSlug: string },
  payload: {
    id: string;
    title: string;
    url: string;
    sourceBranch: string;
    destinationBranch: string;
  }
): ScmPullRequestInfo {
  return {
    provider,
    repo,
    id: payload.id,
    title: payload.title,
    url: payload.url,
    sourceBranch: payload.sourceBranch,
    destinationBranch: payload.destinationBranch,
  };
}
