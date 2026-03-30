export const normalizeLinkTaskKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((tk): tk is string => typeof tk === 'string' && tk.trim().length > 0)
      .map((tk) => tk.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};
