import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { Entity, PropertyDefinition, ViewConfig } from '../../../types';
import { buildColumns } from './buildColumns';
import type { TableRow } from '../types';
import { DELETED_USER_LABEL } from '../../../utils/userDisplay';

const makeEntity = (id: string, taskKey?: string): Entity => ({
  id,
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: taskKey ? { taskKey } : {},
});

const baseView: ViewConfig = {
  id: 'view-1',
  name: 'Tasks',
  type: 'table',
  entityId: 'task',
  visibleProperties: ['taskKey', 'title'],
  sortBy: 'updatedAt',
  sortOrder: 'asc',
};

const orderedProps: PropertyDefinition[] = [
  { name: 'taskKey', type: 'text' },
  { name: 'title', type: 'text' },
];

describe('buildColumns', () => {
  describe('taskKey column', () => {
    it('renders taskKey cell as button when entity exists and onEntityClick is provided', () => {
      const entity = makeEntity('e1', 'TASK-1');
      const onEntityClick = vi.fn();
      const cols = buildColumns({
        orderedProps,
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [entity],
        onEntityClick,
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });
      const taskKeyCol = cols.find((c) => c.field === 'taskKey');
      expect(taskKeyCol).toBeDefined();
      expect(taskKeyCol!.renderCell).toBeDefined();

      const params = {
        value: 'TASK-1',
        row: { __rowId: 'e1', __createdAt: 0, __updatedAt: 0, __id: 'e1', taskKey: 'TASK-1' } as TableRow,
        colDef: {},
        field: 'taskKey',
        api: undefined,
        id: 'e1',
        hasFocus: false,
        tabIndex: -1,
      };
      const element = (taskKeyCol!.renderCell as (p: unknown) => React.ReactNode)(params);
      expect(React.isValidElement(element)).toBe(true);
      const el = element as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
      expect(el.type).toBe('button');
      expect(el.props.onClick).toBeDefined();

      el.props.onClick!({ stopPropagation: vi.fn() } as unknown as React.MouseEvent);
      expect(onEntityClick).toHaveBeenCalledTimes(1);
      expect(onEntityClick).toHaveBeenCalledWith(entity);
    });

    it('renders taskKey cell as span when onEntityClick is not provided', () => {
      const entity = makeEntity('e1', 'TASK-1');
      const cols = buildColumns({
        orderedProps,
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [entity],
        onEntityClick: undefined,
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });
      const taskKeyCol = cols.find((c) => c.field === 'taskKey');
      const params = {
        value: 'TASK-1',
        row: { __rowId: 'e1', __createdAt: 0, __updatedAt: 0, __id: 'e1', taskKey: 'TASK-1' } as TableRow,
        colDef: {},
        field: 'taskKey',
        api: undefined,
        id: 'e1',
        hasFocus: false,
        tabIndex: -1,
      };
      const element = (taskKeyCol!.renderCell as (p: unknown) => React.ReactNode)(params);
      const el = element as React.ReactElement;
      expect(el.type).toBe('span');
    });

    it('renders taskKey cell as span when entity is not in allEntities', () => {
      const onEntityClick = vi.fn();
      const cols = buildColumns({
        orderedProps,
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        onEntityClick,
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });
      const taskKeyCol = cols.find((c) => c.field === 'taskKey');
      const params = {
        value: 'TASK-1',
        row: { __rowId: 'e1', __createdAt: 0, __updatedAt: 0, __id: 'e1', taskKey: 'TASK-1' } as TableRow,
        colDef: {},
        field: 'taskKey',
        api: undefined,
        id: 'e1',
        hasFocus: false,
        tabIndex: -1,
      };
      const element = (taskKeyCol!.renderCell as (p: unknown) => React.ReactNode)(params);
      const el = element as React.ReactElement;
      expect(el.type).toBe('span');
    });

    it('renders dash for empty taskKey value', () => {
      const cols = buildColumns({
        orderedProps,
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });
      const taskKeyCol = cols.find((c) => c.field === 'taskKey');
      const params = {
        value: '',
        row: { __rowId: 'e1', __createdAt: 0, __updatedAt: 0, __id: 'e1', taskKey: '' } as TableRow,
        colDef: {},
        field: 'taskKey',
        api: undefined,
        id: 'e1',
        hasFocus: false,
        tabIndex: -1,
      };
      const element = (taskKeyCol!.renderCell as (p: unknown) => React.ReactNode)(params);
      const el = element as React.ReactElement;
      expect(el.type).toBe('span');
      expect(el.props.className).toContain('text-zinc-500');
    });
  });

  describe('labels column clipboard parsing/formatting', () => {
    it('parses pasted label text into string array', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

      const labelsCol = cols.find((c) => c.field === 'labels');
      expect(labelsCol).toBeDefined();
      expect(labelsCol!.valueParser).toBeUndefined();
      expect(labelsCol!.pastedValueParser).toBeDefined();

      const parsed = (labelsCol!.pastedValueParser as (value: unknown) => unknown)('bug, urgent\ntriage;\tqa');
      expect(parsed).toEqual(['bug', 'urgent', 'triage', 'qa']);
    });

    it('formats label arrays for clipboard copy', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

      const labelsCol = cols.find((c) => c.field === 'labels');
      expect(labelsCol).toBeDefined();
      expect(labelsCol!.valueFormatter).toBeDefined();

      const formatted = (labelsCol!.valueFormatter as (value: unknown) => unknown)(['bug', 'urgent', 'triage']);
      expect(formatted).toBe('bug, urgent, triage');
    });

    it('uses valueGetter string for filtering while preserving row array data', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

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
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

      const labelsCol = cols.find((c) => c.field === 'labels');
      expect(labelsCol).toBeDefined();
      expect(labelsCol!.groupingValueGetter).toBeDefined();

      const groupedEmpty = (labelsCol!.groupingValueGetter as (value: unknown) => unknown)([]);
      const groupedNull = (labelsCol!.groupingValueGetter as (value: unknown) => unknown)(null);
      expect(groupedEmpty).toBe('—');
      expect(groupedNull).toBe('—');
    });

    it('returns joined labels for non-empty grouping value', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

      const labelsCol = cols.find((c) => c.field === 'labels');
      expect(labelsCol).toBeDefined();
      expect(labelsCol!.groupingValueGetter).toBeDefined();

      const grouped = (labelsCol!.groupingValueGetter as (value: unknown) => unknown)(['bug', 'urgent']);
      expect(grouped).toBe('bug, urgent');
    });

    it('sortComparator pushes "—" to the end', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

      const labelsCol = cols.find((c) => c.field === 'labels');
      expect(labelsCol).toBeDefined();
      expect(labelsCol!.sortComparator).toBeDefined();

      const cmp = labelsCol!.sortComparator as (a: unknown, b: unknown) => number;
      expect(cmp('—', 'bug')).toBeGreaterThan(0);
      expect(cmp('bug', '—')).toBeLessThan(0);
      expect(cmp('', 'bug')).toBeGreaterThan(0);
    });

    it('renders grouped labels from params.value on group rows', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

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
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'labels', type: 'labels' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });

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

  describe('date column', () => {
    it('has renderEditCell and valueFormatter for date type', () => {
      const cols = buildColumns({
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
      const dateCol = cols.find((c) => c.field === 'dueDate');
      expect(dateCol).toBeDefined();
      expect(dateCol!.renderEditCell).toBeDefined();
      expect(dateCol!.valueFormatter).toBeDefined();
      expect(dateCol!.valueParser).toBeDefined();

      const formatted = (dateCol!.valueFormatter as (value: unknown) => unknown)('2024-01-15');
      expect(formatted).toBe('2024-01-15');
    });

    it('formats timestamp as YYYY-MM-DD in valueFormatter', () => {
      const cols = buildColumns({
        orderedProps: [{ name: 'taskKey', type: 'text' }, { name: 'dueDate', type: 'date' }],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });
      const dateCol = cols.find((c) => c.field === 'dueDate');
      const ts = new Date('2024-06-20').getTime();
      const formatted = (dateCol!.valueFormatter as (value: unknown) => unknown)(ts);
      expect(formatted).toBe('2024-06-20');
    });
  });

  describe('user column fallback', () => {
    it('renders deleted user label when user cannot be resolved', () => {
      const cols = buildColumns({
        orderedProps: [
          { name: 'taskKey', type: 'text' },
          { name: 'assigneeId', type: 'user' },
        ],
        savedWidths: {},
        savedColumnOrder: null,
        view: baseView,
        allEntities: [],
        usersById: {},
        onUpsertPropertyOption: vi.fn(),
      });
      const userCol = cols.find((c) => c.field === 'assigneeId');
      expect(userCol).toBeDefined();
      expect(userCol!.renderCell).toBeDefined();

      const params = {
        value: 'missing-user-id',
        row: { __rowId: 'e1', __createdAt: 0, __updatedAt: 0, __id: 'e1', assigneeId: 'missing-user-id' } as TableRow,
        colDef: {},
        field: 'assigneeId',
        api: undefined,
        id: 'e1',
        hasFocus: false,
        tabIndex: -1,
      };
      const element = (userCol!.renderCell as (p: unknown) => React.ReactNode)(params) as React.ReactElement;
      expect(element.type).toBe('span');
      expect(element.props.children).toBe(DELETED_USER_LABEL);
    });
  });
});
