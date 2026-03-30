const COLUMN_DROP_PREFIX = 'column::';

export const getColumnDropId = (columnId: string): string => `${COLUMN_DROP_PREFIX}${columnId}`;

const maybeStripColumnDropPrefix = (id: string): string => {
  if (!id.startsWith(COLUMN_DROP_PREFIX)) return id;
  return id.slice(COLUMN_DROP_PREFIX.length);
};

export const findContainerId = (
  id: string,
  itemsByColumn: Record<string, string[]>
): string | null => {
  const normalized = maybeStripColumnDropPrefix(id);
  if (normalized in itemsByColumn) return normalized;
  for (const col of Object.keys(itemsByColumn)) {
    if (itemsByColumn[col].includes(normalized)) return col;
  }
  return null;
};

