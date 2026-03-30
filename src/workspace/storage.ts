type StringMap = Record<string, string>;

const LAST_VIEW_BY_PROJECT_KEY = 'keel_ui:lastViewByProject';
const LAST_WIKI_PAGE_BY_PROJECT_VIEW_KEY = 'keel_ui:lastWikiPageByProjectView';

export const safeReadStringMap = (key: string): StringMap => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as StringMap;
  } catch {
    return {};
  }
};

export const safeWriteJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

export const getLastViewForProject = (projectId: string): string | undefined => {
  const map = safeReadStringMap(LAST_VIEW_BY_PROJECT_KEY);
  const v = map[projectId];
  return typeof v === 'string' && v.trim() ? v : undefined;
};

export const setLastViewForProject = (projectId: string, viewId: string): void => {
  const map = safeReadStringMap(LAST_VIEW_BY_PROJECT_KEY);
  map[projectId] = viewId;
  safeWriteJson(LAST_VIEW_BY_PROJECT_KEY, map);
};

const wikiPageKey = (projectId: string, viewId: string): string => `${projectId}::${viewId}`;

export const getLastWikiPageForProjectView = (
  projectId: string,
  viewId: string
): string | undefined => {
  const map = safeReadStringMap(LAST_WIKI_PAGE_BY_PROJECT_VIEW_KEY);
  const v = map[wikiPageKey(projectId, viewId)];
  return typeof v === 'string' && v.trim() ? v : undefined;
};

export const setLastWikiPageForProjectView = (
  projectId: string,
  viewId: string,
  pageId: string
): void => {
  const map = safeReadStringMap(LAST_WIKI_PAGE_BY_PROJECT_VIEW_KEY);
  map[wikiPageKey(projectId, viewId)] = pageId;
  safeWriteJson(LAST_WIKI_PAGE_BY_PROJECT_VIEW_KEY, map);
};

const SCM_OAUTH_RETURN_TO_PROJECT_DETAILS_KEY = 'keel_ui:scmOAuthReturnToProjectDetails';

export function markReturnToProjectDetailsAfterScmOAuth(): void {
  try {
    sessionStorage.setItem(SCM_OAUTH_RETURN_TO_PROJECT_DETAILS_KEY, '1');
  } catch {
    // Ignore storage errors (e.g. private mode).
  }
}

export function consumeReturnToProjectDetailsAfterScmOAuth(): boolean {
  try {
    const v = sessionStorage.getItem(SCM_OAUTH_RETURN_TO_PROJECT_DETAILS_KEY);
    if (v === '1') {
      sessionStorage.removeItem(SCM_OAUTH_RETURN_TO_PROJECT_DETAILS_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
