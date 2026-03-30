/**
 * Format audit log meta_json for display.
 * - Changes: show only changed fields; task fields as "from -> to"; long text (doc, Description, comments) as line diff.
 * - No changes: show key-value summary.
 */

const LONG_TEXT_KEYS = new Set(['doc', 'Description', 'description', 'comments']);
const MAX_DIFF_LINES = 15;
const MAX_FROM_TO_LEN = 80;
const MAX_DIFF_LINE_LEN = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function inlineContentToText(ic: unknown): string {
  if (!Array.isArray(ic)) return '';
  return ic
    .map((item) => {
      if (!isRecord(item)) return '';
      if (typeof item.text === 'string') return item.text;
      if (Array.isArray(item.content) || Array.isArray(item.children) || isRecord(item.content)) {
        return blockNoteToPlainText(item);
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

function blockNoteToPlainText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return '';
    try {
      return blockNoteToPlainText(JSON.parse(t));
    } catch {
      return raw;
    }
  }
  if (Array.isArray(raw)) return raw.map((x) => blockNoteToPlainText(x)).filter(Boolean).join('\n');
  if (isRecord(raw)) {
    const t = raw.text;
    if (typeof t === 'string') return t;
    const content = raw.content;
    if (isRecord(content) && Array.isArray(content.rows)) {
      return (content.rows as Array<{ cells?: Array<{ content?: unknown }> }>)
        .map((row) =>
          (row.cells || [])
            .map((cell) => (Array.isArray(cell.content) ? inlineContentToText(cell.content) : blockNoteToPlainText(cell.content)))
            .join('\t')
        )
        .join('\n');
    }
    const parts: string[] = [];
    if (Array.isArray(raw.content)) parts.push(blockNoteToPlainText(raw.content));
    if (Array.isArray(raw.children)) parts.push(blockNoteToPlainText(raw.children));
    return parts.filter(Boolean).join('');
  }
  return '';
}

function valueToText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return '';
    try {
      return blockNoteToPlainText(JSON.parse(t));
    } catch {
      return v;
    }
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '';
    const first = v[0];
    if (isRecord(first) && 'doc' in first) {
      return v
        .map((item) => (isRecord(item) && typeof item.doc === 'string' ? blockNoteToPlainText(item.doc) : ''))
        .filter(Boolean)
        .join('\n\n');
    }
    return JSON.stringify(v);
  }
  if (isRecord(v)) return blockNoteToPlainText(v);
  return JSON.stringify(v);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stringifyJson(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function formatAiMeta(ai: Record<string, unknown>): string {
  const lines: string[] = [];
  const kind = typeof ai.kind === 'string' ? ai.kind : '';
  const provider = typeof ai.provider === 'string' ? ai.provider : '';
  const model = typeof ai.model === 'string' ? ai.model : '';
  const projectId = typeof ai.projectId === 'string' ? ai.projectId : '';

  if (kind) lines.push(`AI Kind: ${kind}`);
  if (provider) lines.push(`Provider: ${provider}`);
  if (model) lines.push(`Model: ${model}`);
  if (projectId) lines.push(`Project ID: ${projectId}`);

  const prompt = ai.prompt;
  if (typeof prompt === 'string') {
    if (prompt) lines.push(`Prompt:\n${prompt}`);
  } else if (isRecord(prompt)) {
    const system = typeof prompt.system === 'string' ? prompt.system : '';
    const user = typeof prompt.user === 'string' ? prompt.user : '';
    if (system) lines.push(`Prompt (system):\n${system}`);
    if (user) lines.push(`Prompt (user):\n${user}`);
  }

  if ('result' in ai) {
    const resultText = stringifyJson(ai.result);
    if (resultText) lines.push(`Result:\n${resultText}`);
  }

  const toolCalls = ai.toolCalls;
  if (Array.isArray(toolCalls)) {
    if (toolCalls.length === 0) {
      lines.push('Tool Calls: none');
    } else {
      const callLines = toolCalls.map((call) => {
        if (!isRecord(call)) return '- (invalid tool call)';
        const name = typeof call.name === 'string' ? call.name : 'unknown';
        const args = stringifyJson(call.arguments);
        return `- ${name}${args ? ` ${args}` : ''}`;
      });
      lines.push(`Tool Calls:\n${callLines.join('\n')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n\n') : '—';
}

function truncateLine(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '...';
}

function simpleLineDiff(fromStr: string, toStr: string): string[] {
  const a = fromStr.split(/\r?\n/);
  const b = toStr.split(/\r?\n/);
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return b.slice(0, MAX_DIFF_LINES).map((l) => `+ ${truncateLine(l, MAX_DIFF_LINE_LEN)}`);
  if (b.length === 0) return a.slice(0, MAX_DIFF_LINES).map((l) => `- ${truncateLine(l, MAX_DIFF_LINE_LEN)}`);

  if (a.length === 1 && b.length === 1 && a[0] !== b[0]) {
    return [`- ${truncateLine(a[0], MAX_DIFF_LINE_LEN)}`, `+ ${truncateLine(b[0], MAX_DIFF_LINE_LEN)}`];
  }
  const aSet = new Set(a);
  const bSet = new Set(b);
  const out: string[] = [];
  for (const line of a) {
    if (!bSet.has(line)) out.push(`- ${truncateLine(line, MAX_DIFF_LINE_LEN)}`);
    if (out.length >= MAX_DIFF_LINES) break;
  }
  for (const line of b) {
    if (!aSet.has(line)) out.push(`+ ${truncateLine(line, MAX_DIFF_LINE_LEN)}`);
    if (out.length >= MAX_DIFF_LINES) break;
  }
  return out;
}

function formatChangeValue(key: string, fromVal: unknown, toVal: unknown): string {
  if (jsonEqual(fromVal, toVal)) return '';

  const fromStr = valueToText(fromVal);
  const toStr = valueToText(toVal);

  if (LONG_TEXT_KEYS.has(key)) {
    if (fromStr === toStr) {
      return `${key}: formatting only (text unchanged)`;
    }
    const diff = simpleLineDiff(fromStr, toStr);
    if (diff.length === 0) return `${key}: formatting only (text unchanged)`;
    return `${key}:\n${diff.join('\n')}`;
  }

  const trunc = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max) + '...');
  const fromDisplay = trunc(fromStr || '(empty)', MAX_FROM_TO_LEN);
  const toDisplay = trunc(toStr || '(empty)', MAX_FROM_TO_LEN);
  return `${key}: ${fromDisplay} -> ${toDisplay}`;
}

export function formatAuditLogMeta(metaJson: string | null): string {
  if (!metaJson || !metaJson.trim()) return '—';
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return metaJson;
  }
  if (!isRecord(parsed)) return metaJson;

  if (isRecord(parsed.ai)) {
    return formatAiMeta(parsed.ai);
  }

  const changes = parsed.changes;
  if (changes && isRecord(changes)) {
    const parts: string[] = [];
    const entityType = typeof parsed.entity_type === 'string' ? parsed.entity_type : '';
    const entityId = typeof parsed.entity_id === 'string' ? parsed.entity_id : '';
    const entityTitle = typeof parsed.entity_title === 'string' ? parsed.entity_title : '';
    if (entityType && (entityType === 'TASK' || entityType === 'item' || entityType === 'WIKI')) {
      const ident = entityTitle ? `${entityTitle} (${entityId})` : entityId;
      parts.push(`${entityType === 'WIKI' ? 'Wiki' : 'Task'}: ${ident}`);
    }
    for (const [key, val] of Object.entries(changes)) {
      if (!isRecord(val) || !('from' in val) || !('to' in val)) continue;
      const part = formatChangeValue(key, val.from, val.to);
      if (part) parts.push(part);
    }
    if (parts.length === 0) return '—';
    return parts.join('\n\n');
  }

  const exclude = new Set(['changes']);
  const summary: string[] = [];
  for (const [k, v] of Object.entries(parsed)) {
    if (exclude.has(k)) continue;
    if (v === null || v === undefined) continue;
    const str = typeof v === 'string' ? v : JSON.stringify(v);
    if (str.length > MAX_FROM_TO_LEN) summary.push(`${k}: ${str.slice(0, MAX_FROM_TO_LEN)}...`);
    else summary.push(`${k}: ${str}`);
  }
  return summary.length > 0 ? summary.join('\n') : '—';
}
