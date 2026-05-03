import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { buildColumns } from './buildColumns';
import type { TableRow } from '../types';
import { baseView } from './buildColumns.test.helpers';

const withLabels = () => [
  { name: 'taskKey' as const, type: 'text' as const },
  { name: 'labels' as const, type: 'labels' as const },
];

const buildLabelsCols = () =>
  buildColumns({
    orderedProps: withLabels(),
    savedWidths: {},
    savedColumnOrder: null,
    view: baseView,
    allEntities: [],
    usersById: {},
    onUpsertPropertyOption: vi.fn(),
  });

describe('buildColumns - labels column clipboard parsing/formatting', () => {
  it('parses pasted label text into string array', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.valueParser).toBeUndefined();
    expect(labelsCol!.pastedValueParser).toBeDefined();

    const parsed = (labelsCol!.pastedValueParser as (value: unknown) => unknown)('bug, urgent\ntriage;\tqa');
    expect(parsed).toEqual(['bug', 'urgent', 'triage', 'qa']);
  });

  it('formats label arrays for clipboard copy', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.valueFormatter).toBeDefined();

    const formatted = (labelsCol!.valueFormatter as (value: unknown) => unknown)(['bug', 'urgent', 'triage']);
    expect(formatted).toBe('bug, urgent, triage');
  });

  it('uses valueGetter string for filtering while preserving row array data', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.valueGetter).toBeDefined();

    const row = {
      __rowId: 'e1',
      __createdAt: 0,
      __updatedAt: 0,
      __id: 'e1',
      labels: ['bug', 'urgent'],
    } as unknown as TableRow;

    const filterValue = (labelsCol!.valueGetter as (value: unknown, row: TableRow) => unknown)(undefined, row);
    expect(filterValue).toBe('bug, urgent');
  });

  it('returns grouping value "—" when labels are empty', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.groupingValueGetter).toBeDefined();

    const groupedEmpty = (labelsCol!.groupingValueGetter as (value: unknown) => unknown)([]);
    const groupedNull = (labelsCol!.groupingValueGetter as (value: unknown) => unknown)(null);
    expect(groupedEmpty).toBe('—');
    expect(groupedNull).toBe('—');
  });

  it('returns joined labels for non-empty grouping value', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.groupingValueGetter).toBeDefined();

    const grouped = (labelsCol!.groupingValueGetter as (value: unknown) => unknown)(['bug', 'urgent']);
    expect(grouped).toBe('bug, urgent');
  });

  it('sortComparator pushes "—" to the end', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.sortComparator).toBeDefined();

    const cmp = labelsCol!.sortComparator as (a: unknown, b: unknown) => number;
    expect(cmp('—', 'bug')).toBeGreaterThan(0);
    expect(cmp('bug', '—')).toBeLessThan(0);
    expect(cmp('', 'bug')).toBeGreaterThan(0);
  });

  it('renders grouped labels from params.value on group rows', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.renderCell).toBeDefined();

    const groupedParams = {
      value: 'bug',
      row: {
        __rowId: 'group-row',
        __createdAt: 0,
        __updatedAt: 0,
        __id: 'group-row',
        labels: [],
      } as unknown as TableRow,
      rowNode: { type: 'group' },
    };

    const element = (labelsCol!.renderCell as (p: unknown) => React.ReactNode)(groupedParams);
    const el = element as React.ReactElement;
    expect(el.type).not.toBe('span');
  });

  it('does not render pill for empty marker group values', () => {
    const cols = buildLabelsCols();

    const labelsCol = cols.find((c) => c.field === 'labels');
    expect(labelsCol).toBeDefined();
    expect(labelsCol!.renderCell).toBeDefined();

    const groupedParams = {
      value: '—',
      row: {
        __rowId: 'group-row',
        __createdAt: 0,
        __updatedAt: 0,
        __id: 'group-row',
        labels: [],
      } as unknown as TableRow,
      rowNode: { type: 'group' },
    };

    const element = (labelsCol!.renderCell as (p: unknown) => React.ReactNode)(groupedParams);
    const el = element as React.ReactElement;
    expect(el.type).toBe('span');
    expect(el.props.className).toContain('text-zinc-500');
  });
});
