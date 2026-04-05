const RECENT_LABELS_STORAGE_KEY = 'keel_ui:recentLabelsByEntityProp';
const RECENT_LABELS_MAX_SIZE = 20;

export const DEFAULT_RECENT_LABELS_PINNED_COUNT = 3;

type RecentLabelsByEntityProp = Record<string, string[]>;

const makeEntityPropKey = (entityTypeId: string, propName: string): string => `${entityTypeId}::${propName}`;

/** Unicode NFC + trim for stable substring matching (e.g. compatibility forms). */
const normalizeForLabelMatch = (value: string): string =>
  value.trim().normalize('NFC').toLowerCase();

const normalizeLabels = (labels: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

const safeReadRecentLabelsMap = (): RecentLabelsByEntityProp => {
  try {
    const raw = localStorage.getItem(RECENT_LABELS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: RecentLabelsByEntityProp = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== 'string' || !Array.isArray(value)) continue;
      const normalized = normalizeLabels(value.filter((item): item is string => typeof item === 'string'));
      if (normalized.length > 0) {
        result[key] = normalized.slice(0, RECENT_LABELS_MAX_SIZE);
      }
    }
    return result;
  } catch {
    return {};
  }
};

const safeWriteRecentLabelsMap = (value: RecentLabelsByEntityProp): void => {
  try {
    localStorage.setItem(RECENT_LABELS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

export const getRecentLabels = (entityTypeId: string, propName: string): string[] => {
  const entityTypeIdTrimmed = entityTypeId.trim();
  const propNameTrimmed = propName.trim();
  if (!entityTypeIdTrimmed || !propNameTrimmed) return [];

  const all = safeReadRecentLabelsMap();
  const key = makeEntityPropKey(entityTypeIdTrimmed, propNameTrimmed);
  return all[key] ?? [];
};

export const recordRecentLabels = (entityTypeId: string, propName: string, labels: string[]): void => {
  const entityTypeIdTrimmed = entityTypeId.trim();
  const propNameTrimmed = propName.trim();
  if (!entityTypeIdTrimmed || !propNameTrimmed) return;

  const incoming = normalizeLabels(labels);
  if (incoming.length === 0) return;

  const key = makeEntityPropKey(entityTypeIdTrimmed, propNameTrimmed);
  const all = safeReadRecentLabelsMap();
  const current = all[key] ?? [];
  const next = [...current];

  // Move each incoming label to the front in the given order.
  for (const label of incoming) {
    const existingIndex = next.indexOf(label);
    if (existingIndex >= 0) {
      next.splice(existingIndex, 1);
    }
    next.unshift(label);
  }

  all[key] = next.slice(0, RECENT_LABELS_MAX_SIZE);
  safeWriteRecentLabelsMap(all);
};

type BuildLabelOptionsWithRecentArgs = {
  entityTypeId: string;
  propName: string;
  options: string[];
  inputValue: string;
  pinnedCount?: number;
  maxOptionsDisplay: number;
};

/**
 * Use as MUI Autocomplete `filterOptions`: we already filter in {@link buildLabelOptionsWithRecent}.
 * Without this, MUI applies a second pass (trim/accents rules) and can hide all options for some inputs.
 */
export const labelAutocompletePassthroughFilterOptions = <T,>(options: T[]): T[] => options;

export const buildLabelOptionsWithRecent = ({
  entityTypeId,
  propName,
  options,
  inputValue,
  pinnedCount = DEFAULT_RECENT_LABELS_PINNED_COUNT,
  maxOptionsDisplay,
}: BuildLabelOptionsWithRecentArgs): string[] => {
  const normalizedOptions = normalizeLabels(options);
  const queryNorm = normalizeForLabelMatch(inputValue);
  const filtered = queryNorm
    ? normalizedOptions.filter((option) => normalizeForLabelMatch(option).includes(queryNorm))
    : normalizedOptions;

  const recent = getRecentLabels(entityTypeId, propName);
  const recentSet = new Set(recent);
  const recentInFiltered = recent.filter((label) => filtered.includes(label));
  const pinned = recentInFiltered.slice(0, Math.max(0, pinnedCount));
  const rest = filtered.filter((option) => !recentSet.has(option) || !pinned.includes(option));

  return [...pinned, ...rest].slice(0, Math.max(0, maxOptionsDisplay));
};
