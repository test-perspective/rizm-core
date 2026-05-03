import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { buildColumns } from './buildColumns';
import type { TableRow } from '../types';
import { DELETED_USER_LABEL } from '../../../utils/userDisplay';
import { baseView, makeEntity, orderedProps } from './buildColumns.test.helpers';

describe('buildColumns - taskKey column', () => {
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

  it('defines sortComparator that orders by project key then numeric sequence', () => {
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
    expect(taskKeyCol).toBeDefined();
    expect(taskKeyCol!.sortComparator).toBeDefined();

    const cmp = taskKeyCol!.sortComparator as (a: unknown, b: unknown) => number;
    expect(cmp('REQ-2', 'REQ-10')).toBeLessThan(0);
    expect(cmp('AAA-9', 'BBB-1')).toBeLessThan(0);
    expect(cmp('', 'REQ-1')).toBeGreaterThan(0);
  });
});

describe('buildColumns - user column fallback', () => {
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
