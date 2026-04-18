/**
 * Persists notes pane state per project + board/table view (REQ-288).
 * Key: projectId::viewId where viewId is the board or table view being split.
 */

const STORAGE_KEY = 'keel_ui:notePaneByProjectView';

export type NotePanePrefs = {
  open: boolean;
  pageId: string | null;
  /** Left pane width in pixels; clamped when read/written. */
  widthPx: number;
};

const DEFAULT_WIDTH_PX = 360;
const MIN_WIDTH_PX = 240;
const MAX_WIDTH_PX = 900;

type PrefsMap = Record<string, NotePanePrefs>;

const makeKey = (projectId: string, viewId: string): string => `${projectId}::${viewId}`;

const safeReadMap = (): PrefsMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as PrefsMap;
  } catch {
    return {};
  }
};

const safeWriteMap = (map: PrefsMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

const clampWidth = (w: number): number =>
  Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_PX, Math.round(w)));

const normalizePrefs = (raw: unknown): NotePanePrefs | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const open = o.open === true;
  const pageId = typeof o.pageId === 'string' && o.pageId.trim() ? o.pageId : null;
  const w =
    typeof o.widthPx === 'number' && Number.isFinite(o.widthPx) ? clampWidth(o.widthPx) : DEFAULT_WIDTH_PX;
  return { open, pageId, widthPx: w };
};

export const getDefaultNotePaneWidthPx = (): number => {
  if (typeof window === 'undefined') return DEFAULT_WIDTH_PX;
  return clampWidth(Math.round(window.innerWidth * 0.38));
};

export function getNotePanePrefs(projectId: string, viewId: string): NotePanePrefs {
  const map = safeReadMap();
  const key = makeKey(projectId, viewId);
  const parsed = normalizePrefs(map[key]);
  if (parsed) {
    return { ...parsed, widthPx: clampWidth(parsed.widthPx) };
  }
  return {
    open: false,
    pageId: null,
    widthPx: getDefaultNotePaneWidthPx(),
  };
}

export function setNotePanePrefs(projectId: string, viewId: string, prefs: NotePanePrefs): void {
  const map = safeReadMap();
  const key = makeKey(projectId, viewId);
  map[key] = {
    open: prefs.open,
    pageId: prefs.pageId && prefs.pageId.trim() ? prefs.pageId : null,
    widthPx: clampWidth(prefs.widthPx || DEFAULT_WIDTH_PX),
  };
  safeWriteMap(map);
}

export const notePaneWidthBounds = { min: MIN_WIDTH_PX, max: MAX_WIDTH_PX, default: DEFAULT_WIDTH_PX };
