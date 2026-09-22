import type { NavigateFunction } from 'react-router-dom';

import type { ProjectManifest } from '../types';
import type { SearchResult } from '../api/search';
import { navigateToWorkspaceEntity, resolveViewIdForEntityKind } from './entityRouting';

export function resolveViewIdForSearchKind(nextManifest: ProjectManifest, kind: SearchResult['kind']) {
  return resolveViewIdForEntityKind(nextManifest, kind);
}

/**
 * Open a search hit. Failures are logged and swallowed: a search result that cannot
 * be resolved should leave the palette as it was rather than surface an error.
 */
export async function navigateToSearchResult(args: {
  result: SearchResult;
  query: string;
  activeProjectId: string;
  activeManifest: ProjectManifest | null;
  navigate: NavigateFunction;
}): Promise<void> {
  const { result, query, activeProjectId, activeManifest, navigate } = args;
  try {
    await navigateToWorkspaceEntity({
      kind: result.kind,
      projectId: result.projectId,
      entityPk: result.entityPk,
      activeProjectId,
      activeManifest,
      navigate,
      navigateState: result.kind === 'page' ? { searchQuery: query } : undefined,
    });
  } catch (e) {
    console.error('Failed to open search result:', e);
  }
}
