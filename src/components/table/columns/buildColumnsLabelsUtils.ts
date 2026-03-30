export const EMPTY_LABEL_GROUP_VALUE = '—';

export const parseLabelsValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (value === null || value === undefined) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/[,\n\r\t;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [String(value).trim()].filter((item) => item.length > 0);
};

export const formatLabelsValue = (value: unknown): string => {
  const labels = parseLabelsValue(value);
  return labels.join(', ');
};

export const getLabelsGroupingValue = (value: unknown): string => {
  const formatted = formatLabelsValue(value);
  if (!formatted) return EMPTY_LABEL_GROUP_VALUE;
  return formatted;
};

export const isEmptyLabelToken = (label: string): boolean => {
  const normalized = label.trim();
  return normalized === '' || normalized === '-' || normalized === EMPTY_LABEL_GROUP_VALUE;
};
