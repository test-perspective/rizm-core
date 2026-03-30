import { apiJson } from '../auth/api';

export type SearchScope = 'global' | 'project';
export type SearchKind = 'task' | 'page';

export type SearchResult = {
  kind: SearchKind;
  projectId: string;
  projectName: string;
  entityPk: string;
  title: string;
  preview: string;
  taskKey?: string;
  distance: number;
};

export async function searchApi(params: {
  query: string;
  scope?: SearchScope;
  projectId?: string;
  types?: SearchKind[];
  limit?: number;
}): Promise<SearchResult[]> {
  const qs = new URLSearchParams();
  qs.set('q', params.query);
  if (params.scope) qs.set('scope', params.scope);
  if (params.projectId) qs.set('projectId', params.projectId);
  if (params.types && params.types.length > 0) qs.set('types', params.types.join(','));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  return await apiJson<SearchResult[]>(`/api/search?${qs.toString()}`);
}
