/**
 * Compare task keys for table sorting: project prefix (string) then trailing numeric sequence.
 * Keys like "REQ-2" sort before "REQ-10". Unparseable values fall back to full-string compare.
 * Empty / null values sort after non-empty (ascending: blanks at bottom).
 */
const LOCALE_COMPARE_OPTS = { sensitivity: 'base' as const };

function normalizeCellValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v).trim();
}

type ParsedStandard = { kind: 'standard'; prefix: string; seq: number };
type ParsedRaw = { kind: 'raw'; raw: string };

function parseTaskKey(s: string): ParsedStandard | ParsedRaw {
  const lastHyphen = s.lastIndexOf('-');
  if (lastHyphen <= 0 || lastHyphen >= s.length - 1) {
    return { kind: 'raw', raw: s };
  }
  const tail = s.slice(lastHyphen + 1);
  if (!/^\d+$/.test(tail)) {
    return { kind: 'raw', raw: s };
  }
  const seq = Number(tail);
  if (!Number.isFinite(seq)) {
    return { kind: 'raw', raw: s };
  }
  return { kind: 'standard', prefix: s.slice(0, lastHyphen), seq };
}

/** Exported for unit tests and reuse. */
export function compareTaskKeyForSort(a: unknown, b: unknown): number {
  const as = normalizeCellValue(a);
  const bs = normalizeCellValue(b);

  const emptyA = as === '';
  const emptyB = bs === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  const pa = parseTaskKey(as);
  const pb = parseTaskKey(bs);

  if (pa.kind === 'standard' && pb.kind === 'standard') {
    const prefixCmp = pa.prefix.localeCompare(pb.prefix, undefined, LOCALE_COMPARE_OPTS);
    if (prefixCmp !== 0) return prefixCmp;
    return pa.seq - pb.seq;
  }

  return as.localeCompare(bs, undefined, LOCALE_COMPARE_OPTS);
}
