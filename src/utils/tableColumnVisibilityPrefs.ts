/**
 * Table view column visibility preferences persistence.
 * Stores column visibility state per project + view combination in localStorage.
 */

const STORAGE_KEY = 'keel_ui:tableColumnVisibility';

type ColumnVisibility = Record<string, boolean>; // field -> visible (true/false)
type PrefsByProjectView = Record<string, ColumnVisibility>; // "${projectId}::${viewId}" -> ColumnVisibility

const safeReadPrefs = (): PrefsByProjectView => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Validate structure: all values should be objects with string->boolean mappings
    const result: PrefsByProjectView = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === 'string' && value && typeof value === 'object' && !Array.isArray(value)) {
        const visibility: ColumnVisibility = {};
        for (const [field, visible] of Object.entries(value)) {
          if (typeof field === 'string' && typeof visible === 'boolean') {
            visibility[field] = visible;
          }
        }
        if (Object.keys(visibility).length > 0) {
          result[key] = visibility;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
};

const safeWritePrefs = (prefs: PrefsByProjectView): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

const makeKey = (projectId: string, viewId: string): string => {
  return `${projectId}::${viewId}`;
};

/**
 * Get saved column visibility for a specific project + view.
 * Returns undefined if no preferences exist.
 */
export const getColumnVisibility = (projectId: string, viewId: string): ColumnVisibility | undefined => {
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  const visibility = prefs[key];
  return visibility && Object.keys(visibility).length > 0 ? visibility : undefined;
};

/**
 * Set column visibility for a specific project + view.
 * Merges with existing preferences.
 */
export const setColumnVisibility = (projectId: string, viewId: string, visibility: ColumnVisibility): void => {
  if (!projectId || !viewId || !visibility || Object.keys(visibility).length === 0) return;
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  prefs[key] = {
    ...prefs[key],
    ...visibility,
  };
  safeWritePrefs(prefs);
};
