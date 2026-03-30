import { toCsv } from './exportZip';

type CsvPrimitive = string | number | boolean | bigint | null | undefined;

export type TableCsvExportColumn<Row extends Record<string, unknown>> = {
  field: string;
  headerName?: string;
  valueGetter?: (value: unknown, row: Row) => unknown;
  valueFormatter?: (value: unknown, row?: Row) => unknown;
};

export type BuildTableCsvInput<Row extends Record<string, unknown>> = {
  columns: TableCsvExportColumn<Row>[];
  rows: Row[];
};

const stringifyCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const callValueFormatter = <Row extends Record<string, unknown>>(
  formatter: (value: unknown, row?: Row) => unknown,
  value: unknown,
  row: Row
): unknown => {
  try {
    return formatter(value, row);
  } catch {
    try {
      return formatter(value);
    } catch {
      return value;
    }
  }
};

export const buildTableCsv = <Row extends Record<string, unknown>>({
  columns,
  rows,
}: BuildTableCsvInput<Row>): string => {
  const header = columns.map((column) => column.headerName?.trim() || column.field);
  const dataRows = rows.map((row) =>
    columns.map((column) => {
      const sourceValue = row[column.field] as CsvPrimitive | unknown;
      const value = column.valueGetter ? column.valueGetter(sourceValue, row) : sourceValue;
      const formatted = column.valueFormatter ? callValueFormatter(column.valueFormatter, value, row) : value;
      return stringifyCellValue(formatted);
    })
  );
  return toCsv([header, ...dataRows]);
};

const safeFileSegment = (segment: string): string => segment.replace(/[\\/:*?"<>|]/g, '_');

const compactFileSegment = (segment: string, maxLength: number): string => {
  const normalized = safeFileSegment(segment).trim().replace(/\s+/g, '_');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength);
};

type TableCsvFilenameInput = {
  projectKey: string;
  viewName: string;
  filterSummary?: string;
  now?: Date;
};

export const makeTableCsvFilename = ({
  projectKey,
  viewName,
  filterSummary,
  now = new Date(),
}: TableCsvFilenameInput): string => {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
  const safeProject = compactFileSegment(projectKey || 'project', 40) || 'project';
  const safeView = compactFileSegment(viewName || 'view', 50) || 'view';
  const safeFilter = compactFileSegment(filterSummary || 'all', 80) || 'all';
  return `rizm-table-${safeProject}-${safeView}-${safeFilter}-${timestamp}.csv`;
};
