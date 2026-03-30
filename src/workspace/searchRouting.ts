import type { ProjectManifest } from '../types';
import type { SearchResult } from '../api/search';

export function resolveViewIdForSearchKind(nextManifest: ProjectManifest, kind: SearchResult['kind']) {
  if (kind === 'task') {
    const board = nextManifest.views.find((v) => v.type === 'board' && v.entityId === 'task');
    if (board) return board.id;
  }
  if (kind === 'page') {
    const wiki = nextManifest.views.find((v) => v.type === 'wiki' && v.entityId === 'wikiPage');
    if (wiki) return wiki.id;
  }
  return nextManifest.defaultView || nextManifest.views[0]?.id || '';
}
