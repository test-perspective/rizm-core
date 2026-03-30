/**
 * Wiki page list pane width persistence.
 * Stores width per project + view combination in localStorage.
 */

const STORAGE_KEY = 'keel_ui:wikiPageListWidth';
const DEFAULT_WIDTH = 288; // w-72 equivalent
const MIN_WIDTH = 200;
const MAX_WIDTH_RATIO = 0.6;

type WidthByProjectView = Record<string, number>; // "${projectId}::${viewId}" -> width (px)

const safeReadPrefs = (): WidthByProjectView => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: WidthByProjectView = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === 'string' && typeof value === 'number' && value >= MIN_WIDTH) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
};

const safeWritePrefs = (prefs: WidthByProjectView): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

const makeKey = (projectId: string, viewId: string | undefined): string => {
  return `${projectId}::${viewId ?? 'default'}`;
};

export const getMaxWidth = (): number => {
  return Math.floor(
    typeof window !== 'undefined' ? window.innerWidth * MAX_WIDTH_RATIO : 800
  );
};

export const getDefaultWidth = (): number => DEFAULT_WIDTH;

export const getMinWidth = (): number => MIN_WIDTH;

/**
 * Get saved page list width for a specific project + view.
 * Returns undefined if no width is saved.
 */
export const getPageListWidth = (
  projectId: string,
  viewId?: string
): number | undefined => {
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  const width = prefs[key];
  if (width === undefined) return undefined;
  const maxW = getMaxWidth();
  return Math.min(Math.max(MIN_WIDTH, width), maxW);
};

/**
 * Set page list width for a specific project + view.
 */
export const setPageListWidth = (
  projectId: string,
  viewId: string | undefined,
  width: number
): void => {
  if (!projectId || width < MIN_WIDTH) return;
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  prefs[key] = Math.min(width, getMaxWidth());
  safeWritePrefs(prefs);
};
