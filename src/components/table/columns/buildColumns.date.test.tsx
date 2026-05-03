import { describe, it, expect, vi } from 'vitest';
import { buildColumns } from './buildColumns';
import { baseView } from './buildColumns.test.helpers';

const buildDateCols = () =>
  buildColumns({
    orderedProps: [
      { name: 'taskKey', type: 'text' },
      { name: 'dueDate', type: 'date' },
    ],
    savedWidths: {},
    savedColumnOrder: null,
    view: baseView,
    allEntities: [],
    usersById: {},
    onUpsertPropertyOption: vi.fn(),
  });

describe('buildColumns - date column', () => {
  it('has renderEditCell and valueFormatter for date type', () => {
    const cols = buildDateCols();
    const dateCol = cols.find((c) => c.field === 'dueDate');
    expect(dateCol).toBeDefined();
    expect(dateCol!.renderEditCell).toBeDefined();
    expect(dateCol!.valueFormatter).toBeDefined();
    expect(dateCol!.valueParser).toBeDefined();

    const formatted = (dateCol!.valueFormatter as (value: unknown) => unknown)('2024-01-15');
    expect(formatted).toBe('2024-01-15');
  });

  it('formats timestamp as YYYY-MM-DD in valueFormatter', () => {
    const cols = buildDateCols();
    const dateCol = cols.find((c) => c.field === 'dueDate');
    const ts = new Date('2024-06-20').getTime();
    const formatted = (dateCol!.valueFormatter as (value: unknown) => unknown)(ts);
    expect(formatted).toBe('2024-06-20');
  });
});
