type InlineContent = {
  type?: string;
  text?: string;
  styles?: Record<string, unknown>;
  props?: Record<string, unknown>;
  content?: InlineContent[];
};

/** Replacement pairs: input pattern -> Unicode symbol. Order by pattern length descending for correct matching. */
const SYMBOL_MAP: Array<[string, string]> = [
  ['(tm)', '™'],
  ['(c)', '©'],
  ['(r)', '®'],
  ['=>', '⇒'],
  ['<=', '⇐'],
  ['->', '→'],
  ['<-', '←'],
  ['>>', '»'],
  ['<<', '«'],
];

/** Reverse map: symbol -> pattern (for ESC revert) */
const SYMBOL_TO_PATTERN = new Map<string, string>(SYMBOL_MAP.map(([p, s]) => [s, p]));

function isTextItem(item: InlineContent): item is InlineContent & { text: string } {
  return item.type === 'text' && typeof item.text === 'string';
}

/**
 * Replaces trailing symbol patterns (e.g. "->", "(c)") with Unicode equivalents
 * in inline content. Only matches at the very end to avoid cursor jump issues.
 * Returns { changed, content } - content is new array only when changed.
 */
export function replaceTrailingSymbols(
  content: InlineContent[]
): { changed: boolean; content: InlineContent[] } {
  if (content.length === 0) return { changed: false, content };

  const trailingTextIndices: number[] = [];
  for (let i = content.length - 1; i >= 0; i--) {
    if (isTextItem(content[i])) {
      trailingTextIndices.push(i);
    } else {
      break;
    }
  }
  trailingTextIndices.reverse();

  if (trailingTextIndices.length === 0) return { changed: false, content };

  let trailingText = '';
  let lastStyles: Record<string, unknown> = {};
  for (const i of trailingTextIndices) {
    const item = content[i];
    if (isTextItem(item)) {
      trailingText += item.text;
      lastStyles = item.styles ?? {};
    }
  }

  for (const [pattern, symbol] of SYMBOL_MAP) {
    if (trailingText.endsWith(pattern)) {
      const newTrailing = trailingText.slice(0, -pattern.length) + symbol;
      const prefix = content.slice(0, trailingTextIndices[0]);
      const replacement: InlineContent = { type: 'text', text: newTrailing, styles: lastStyles };
      return {
        changed: true,
        content: [...prefix, replacement],
      };
    }
  }

  return { changed: false, content };
}

/**
 * Returns the trailing Unicode symbol if the content ends with one we can revert (ESC).
 */
export function findTrailingSymbol(content: InlineContent[]): string | null {
  if (content.length === 0) return null;

  let trailingText = '';
  for (let i = content.length - 1; i >= 0; i--) {
    const item = content[i];
    if (isTextItem(item)) {
      trailingText = item.text + trailingText;
    } else {
      break;
    }
  }

  const symbols = Array.from(SYMBOL_TO_PATTERN.keys()).sort((a, b) => b.length - a.length);
  for (const symbol of symbols) {
    if (trailingText.endsWith(symbol)) return symbol;
  }
  return null;
}

/**
 * Reverts a trailing symbol back to its original pattern (e.g. → -> "->").
 */
export function revertTrailingSymbol(
  content: InlineContent[],
  symbol: string
): { changed: boolean; content: InlineContent[] } {
  const pattern = SYMBOL_TO_PATTERN.get(symbol);
  if (!pattern) return { changed: false, content };

  const trailingTextIndices: number[] = [];
  for (let i = content.length - 1; i >= 0; i--) {
    if (isTextItem(content[i])) {
      trailingTextIndices.push(i);
    } else {
      break;
    }
  }
  trailingTextIndices.reverse();
  if (trailingTextIndices.length === 0) return { changed: false, content };

  let trailingText = '';
  let lastStyles: Record<string, unknown> = {};
  for (const i of trailingTextIndices) {
    const item = content[i];
    if (isTextItem(item)) {
      trailingText += item.text;
      lastStyles = item.styles ?? {};
    }
  }

  if (!trailingText.endsWith(symbol)) return { changed: false, content };

  const newTrailing = trailingText.slice(0, -symbol.length) + pattern;
  const prefix = content.slice(0, trailingTextIndices[0]);
  const replacement: InlineContent = { type: 'text', text: newTrailing, styles: lastStyles };
  return { changed: true, content: [...prefix, replacement] };
}
