/**
 * Table view column width and order preferences persistence.
 * Stores column widths and order per project + view combination in localStorage.
 */

const STORAGE_KEY_WIDTHS = 'keel_ui:tableColumnWidths';
const STORAGE_KEY_ORDER = 'keel_ui:tableColumnOrder';

type ColumnWidths = Record<string, number>; // field -> width (px)
type PrefsByProjectView = Record<string, ColumnWidths>; // "${projectId}::${viewId}" -> ColumnWidths

const safeReadPrefs = (): PrefsByProjectView => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WIDTHS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Validate structure: all values should be objects with string->number mappings
    const result: PrefsByProjectView = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === 'string' && value && typeof value === 'object' && !Array.isArray(value)) {
        const widths: ColumnWidths = {};
        for (const [field, width] of Object.entries(value)) {
          if (typeof field === 'string' && typeof width === 'number' && width > 0) {
            widths[field] = width;
          }
        }
        if (Object.keys(widths).length > 0) {
          result[key] = widths;
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
    localStorage.setItem(STORAGE_KEY_WIDTHS, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

type ColumnOrder = string[]; // Array of field names in order
type OrderByProjectView = Record<string, ColumnOrder>; // "${projectId}::${viewId}" -> ColumnOrder

const safeReadOrder = (): OrderByProjectView => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORDER);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Validate structure: all values should be arrays of strings
    const result: OrderByProjectView = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === 'string' && Array.isArray(value)) {
        const order: ColumnOrder = value.filter((field): field is string => typeof field === 'string' && field.length > 0);
        if (order.length > 0) {
          result[key] = order;
        }
      }
    }
    return result;
  } catch {
    return {};
  }
};

const safeWriteOrder = (order: OrderByProjectView): void => {
  try {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(order));
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
};

const makeKey = (projectId: string, viewId: string): string => {
  return `${projectId}::${viewId}`;
};

/**
 * Get saved column widths for a specific project + view.
 */
export const getColumnWidths = (projectId: string, viewId: string): ColumnWidths => {
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  return prefs[key] || {};
};

/**
 * Update column width for a specific field in a project + view.
 * Merges with existing preferences.
 */
export const setColumnWidth = (projectId: string, viewId: string, field: string, width: number): void => {
  if (width <= 0 || !field || !projectId || !viewId) return;
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  prefs[key] = {
    ...prefs[key],
    [field]: width,
  };
  safeWritePrefs(prefs);
};

/**
 * Update multiple column widths at once for a project + view.
 */
export const setColumnWidths = (projectId: string, viewId: string, widths: ColumnWidths): void => {
  if (!projectId || !viewId || !widths || Object.keys(widths).length === 0) return;
  const prefs = safeReadPrefs();
  const key = makeKey(projectId, viewId);
  prefs[key] = {
    ...prefs[key],
    ...widths,
  };
  safeWritePrefs(prefs);
};

/**
 * Get saved column order for a specific project + view.
 * Returns undefined if no order is saved.
 */
export const getColumnOrder = (projectId: string, viewId: string): ColumnOrder | undefined => {
  const order = safeReadOrder();
  const key = makeKey(projectId, viewId);
  const savedOrder = order[key];
  return savedOrder && savedOrder.length > 0 ? savedOrder : undefined;
};

/**
 * Set column order for a specific project + view.
 */
export const setColumnOrder = (projectId: string, viewId: string, order: ColumnOrder): void => {
  if (!projectId || !viewId || !order || order.length === 0) {
    return;
  }
  const allOrder = safeReadOrder();
  const key = makeKey(projectId, viewId);
  allOrder[key] = order;
  safeWriteOrder(allOrder);
};
