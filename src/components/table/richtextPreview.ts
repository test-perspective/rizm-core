type PlainTextInput = unknown;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const blockNoteToPlainText = (raw: PlainTextInput): string => {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    // Try to parse BlockNote JSON (array of blocks).
    try {
      return blockNoteToPlainText(JSON.parse(trimmed));
    } catch {
      return raw;
    }
  }
  if (Array.isArray(raw)) {
    // Treat as blocks; separate blocks with newline.
    return raw.map((x) => blockNoteToPlainText(x)).filter(Boolean).join('\n');
  }
  if (isRecord(raw)) {
    const text = raw.text;
    if (typeof text === 'string') return text;
    if (raw.type === 'status' && isRecord(raw.props) && typeof raw.props.text === 'string') {
      return raw.props.text;
    }
    const parts: string[] = [];
    const content = raw.content;
    if (Array.isArray(content)) parts.push(blockNoteToPlainText(content));
    const children = raw.children;
    if (Array.isArray(children)) parts.push(blockNoteToPlainText(children));
    return parts.filter(Boolean).join('');
  }
  return String(raw);
};

export const richTextPreview = (raw: PlainTextInput, maxChars = 80): string => {
  const plain = blockNoteToPlainText(raw);
  const oneLine = plain.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars)}...`;
};

export const formatDateTime = (ms: number): string => {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
};
