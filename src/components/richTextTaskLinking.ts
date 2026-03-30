type InlineContent = {
  type?: string;
  text?: string;
  styles?: Record<string, unknown>;
  props?: {
    taskKey?: string;
  };
  content?: InlineContent[];
};

type TableCellLike = InlineContent[] | { type?: string; content?: InlineContent[]; props?: unknown } | string;

type TableContent = {
  type: 'tableContent';
  rows: Array<{
    cells: TableCellLike[];
  }>;
};

type BlockLike = {
  id: string;
  content?: InlineContent[] | TableContent | unknown;
};

const TASK_KEY_BOUNDARY_PATTERN = /([A-Z][A-Z0-9]*-\d+)(?=[\s.,;:!?)}\]])/g;
const TASK_KEY_TRAILING_PATTERN = /([A-Z][A-Z0-9]*-\d+)(?:[\s.,;:!?)}\]]*)$/;

export const isTableContent = (content: BlockLike['content']): content is TableContent => {
  return Boolean(
    content &&
      typeof content === 'object' &&
      (content as TableContent).type === 'tableContent' &&
      Array.isArray((content as TableContent).rows)
  );
};

const normalizeTableCellToInline = (cell: TableCellLike): InlineContent[] => {
  if (Array.isArray(cell)) return cell;
  if (typeof cell === 'string') return [{ type: 'text', text: cell, styles: {} }];
  if (cell && typeof cell === 'object' && Array.isArray(cell.content)) return cell.content;
  return [];
};

const buildInlineForText = (
  text: string,
  styles: Record<string, unknown> | undefined,
  suppressedKeys: Set<string>
): { changed: boolean; content: InlineContent[] } => {
  const matches = Array.from(text.matchAll(TASK_KEY_BOUNDARY_PATTERN));
  const hasConvertible = matches.some((match) => !suppressedKeys.has(match[1]));
  if (!hasConvertible) {
    return { changed: false, content: [{ type: 'text', text, styles: styles ?? {} }] };
  }

  const result: InlineContent[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const matchText = match[1];

    if (matchIndex > lastIndex) {
      result.push({
        type: 'text',
        text: text.slice(lastIndex, matchIndex),
        styles: styles ?? {},
      });
    }

    if (suppressedKeys.has(matchText)) {
      result.push({
        type: 'text',
        text: matchText,
        styles: styles ?? {},
      });
    } else {
      result.push({
        type: 'taskLink',
        props: {
          taskKey: matchText,
        },
      });
    }

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    result.push({
      type: 'text',
      text: text.slice(lastIndex),
      styles: styles ?? {},
    });
  }

  return { changed: true, content: result };
};

const convertInlineContent = (
  inline: InlineContent[],
  suppressedKeys: Set<string>
): { changed: boolean; content: InlineContent[] } => {
  let changed = false;
  const result: InlineContent[] = [];

  for (const item of inline) {
    if (item.type === 'text' && typeof item.text === 'string') {
      const converted = buildInlineForText(item.text, item.styles, suppressedKeys);
      if (converted.changed) {
        changed = true;
        result.push(...converted.content);
      } else {
        result.push(item);
      }
      continue;
    }

    result.push(item);
  }

  return { changed, content: changed ? result : inline };
};

export const convertBlockContent = (
  block: BlockLike,
  suppressedKeys: Set<string>
): { changed: boolean; content?: InlineContent[] | TableContent } => {
  if (Array.isArray(block.content)) {
    const converted = convertInlineContent(block.content, suppressedKeys);
    if (!converted.changed) return { changed: false };
    return { changed: true, content: converted.content };
  }

  if (isTableContent(block.content)) {
    let tableChanged = false;
    const nextRows = block.content.rows.map((row) => {
      let rowChanged = false;
      const nextCells = row.cells.map((cell) => {
        const cellInline = normalizeTableCellToInline(cell);
        const converted = convertInlineContent(cellInline, suppressedKeys);
        if (converted.changed) rowChanged = true;
        if (!converted.changed) return cell;
        const isTableCell = cell && typeof cell === 'object' && !Array.isArray(cell) && (cell as { type?: string }).type === 'tableCell';
        return isTableCell ? { ...(cell as object), content: converted.content } : converted.content;
      });

      if (!rowChanged) return row;
      tableChanged = true;
      return { ...row, cells: nextCells };
    });

    if (!tableChanged) return { changed: false };
    return { changed: true, content: { ...block.content, rows: nextRows } };
  }

  return { changed: false };
};

export const findTrailingTaskKey = (content: InlineContent[]): string | null => {
  let text = '';
  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string') {
      text += item.text;
      continue;
    }

    if (item.type === 'taskLink' && item.props?.taskKey) {
      text += item.props.taskKey;
    }
  }

  const match = text.match(TASK_KEY_TRAILING_PATTERN);
  return match ? match[1] : null;
};

export const replaceTaskLinkWithText = (
  content: InlineContent[],
  taskKey: string
): { changed: boolean; content: InlineContent[] } => {
  let index = -1;
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const item = content[i];
    if (item.type === 'taskLink' && item.props?.taskKey === taskKey) {
      index = i;
      break;
    }
  }

  if (index < 0) return { changed: false, content };

  const next = [...content];
  next.splice(index, 1, {
    type: 'text',
    text: taskKey,
    styles: {},
  });

  return { changed: true, content: next };
};
