import { describe, expect, it } from 'vitest';
import { buildTableCsv, makeTableCsvFilename } from './tableCsvExport';

type Row = {
  __rowId: string;
  title: string;
  labels: string[];
  priority: string;
};

describe('tableCsvExport', () => {
  it('exports only passed columns in order', () => {
    const rows: Row[] = [
      { __rowId: '1', title: 'Task A', labels: ['bug'], priority: 'High' },
      { __rowId: '2', title: 'Task B', labels: ['ops', 'urgent'], priority: 'Low' },
    ];

    const csv = buildTableCsv<Row>({
      columns: [
        { field: 'title', headerName: 'Title' },
        { field: 'priority', headerName: 'Priority' },
      ],
      rows,
    });

    expect(csv).toContain('Title,Priority');
    expect(csv).toContain('Task A,High');
    expect(csv).toContain('Task B,Low');
    expect(csv).not.toContain('labels');
  });

  it('uses valueGetter and valueFormatter when provided', () => {
    const rows: Row[] = [
      { __rowId: '1', title: 'Task A', labels: ['bug', 'urgent'], priority: 'High' },
    ];

    const csv = buildTableCsv<Row>({
      columns: [
        {
          field: 'labels',
          headerName: 'Labels',
          valueGetter: (value) => (Array.isArray(value) ? value.join('|') : ''),
          valueFormatter: (value) => `#${String(value)}`,
        },
      ],
      rows,
    });

    expect(csv).toContain('Labels');
    expect(csv).toContain('#bug|urgent');
  });

  it('quotes comma/newline/double-quote values', () => {
    const rows = [
      {
        __rowId: '1',
        text: 'a,b',
      },
      {
        __rowId: '2',
        text: 'line1\nline2',
      },
      {
        __rowId: '3',
        text: 'a"b',
      },
    ];

    const csv = buildTableCsv({
      columns: [{ field: 'text', headerName: 'Text' }],
      rows,
    });

    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"a""b"');
  });

  it('falls back to raw value when formatter throws', () => {
    const csv = buildTableCsv({
      columns: [
        {
          field: 'title',
          headerName: 'Title',
          valueFormatter: () => {
            throw new Error('formatter failed');
          },
        },
      ],
      rows: [{ __rowId: '1', title: 'Task A' }],
    });

    expect(csv).toContain('Task A');
  });

  it('creates safe filename with timestamp', () => {
    const filename = makeTableCsvFilename({
      projectKey: 'REQ/1',
      viewName: 'Main:View',
      filterSummary: 'status_contains_done',
      now: new Date('2026-02-18T12:34:56'),
    });
    expect(filename).toBe('rizm-table-REQ_1-Main_View-status_contains_done-2026-02-18_12-34-56.csv');
  });
});
