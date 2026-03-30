import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getColumnWidths, setColumnWidth, setColumnWidths, getColumnOrder, setColumnOrder } from './tableColumnPrefs';

describe('tableColumnPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getColumnWidths returns empty object when no preferences exist', () => {
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({});
  });

  it('setColumnWidth and getColumnWidths round-trip', () => {
    setColumnWidth('project1', 'view1', 'title', 400);
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({ title: 400 });
  });

  it('setColumnWidths updates multiple columns at once', () => {
    setColumnWidths('project1', 'view1', {
      title: 400,
      status: 150,
      priority: 120,
    });
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({
      title: 400,
      status: 150,
      priority: 120,
    });
  });

  it('setColumnWidth merges with existing preferences', () => {
    setColumnWidth('project1', 'view1', 'title', 400);
    setColumnWidth('project1', 'view1', 'status', 150);
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({
      title: 400,
      status: 150,
    });
  });

  it('setColumnWidths merges with existing preferences', () => {
    setColumnWidth('project1', 'view1', 'title', 400);
    setColumnWidths('project1', 'view1', {
      status: 150,
      priority: 120,
    });
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({
      title: 400,
      status: 150,
      priority: 120,
    });
  });

  it('preferences are isolated per project + view', () => {
    setColumnWidth('project1', 'view1', 'title', 400);
    setColumnWidth('project1', 'view2', 'title', 500);
    setColumnWidth('project2', 'view1', 'title', 600);

    expect(getColumnWidths('project1', 'view1')).toEqual({ title: 400 });
    expect(getColumnWidths('project1', 'view2')).toEqual({ title: 500 });
    expect(getColumnWidths('project2', 'view1')).toEqual({ title: 600 });
  });

  it('setColumnWidth ignores invalid inputs', () => {
    setColumnWidth('', 'view1', 'title', 400);
    setColumnWidth('project1', '', 'title', 400);
    setColumnWidth('project1', 'view1', '', 400);
    setColumnWidth('project1', 'view1', 'title', 0);
    setColumnWidth('project1', 'view1', 'title', -100);

    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({});
  });

  it('handles corrupted localStorage gracefully', () => {
    // Simulate corrupted data
    localStorage.setItem('keel_ui:tableColumnWidths', '{not json');
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({});
  });

  it('handles invalid JSON structure gracefully', () => {
    // Simulate invalid structure
    localStorage.setItem('keel_ui:tableColumnWidths', JSON.stringify({ 'project1::view1': 'not an object' }));
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({});
  });

  it('filters out invalid width values', () => {
    // Manually set invalid data
    localStorage.setItem(
      'keel_ui:tableColumnWidths',
      JSON.stringify({
        'project1::view1': {
          title: 400,
          status: 'invalid',
          priority: -50,
          empty: null,
        },
      })
    );
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({ title: 400 });
  });

  it('setColumnWidth updates existing width', () => {
    setColumnWidth('project1', 'view1', 'title', 400);
    setColumnWidth('project1', 'view1', 'title', 500);
    const widths = getColumnWidths('project1', 'view1');
    expect(widths).toEqual({ title: 500 });
  });

  describe('column order', () => {
    it('getColumnOrder returns undefined when no order exists', () => {
      const order = getColumnOrder('project1', 'view1');
      expect(order).toBeUndefined();
    });

    it('setColumnOrder and getColumnOrder round-trip', () => {
      const order = ['title', 'status', 'priority'];
      setColumnOrder('project1', 'view1', order);
      const retrieved = getColumnOrder('project1', 'view1');
      expect(retrieved).toEqual(order);
    });

    it('setColumnOrder replaces existing order', () => {
      setColumnOrder('project1', 'view1', ['title', 'status']);
      setColumnOrder('project1', 'view1', ['priority', 'title', 'status']);
      const order = getColumnOrder('project1', 'view1');
      expect(order).toEqual(['priority', 'title', 'status']);
    });

    it('column order preferences are isolated per project + view', () => {
      setColumnOrder('project1', 'view1', ['title', 'status']);
      setColumnOrder('project1', 'view2', ['status', 'title']);
      setColumnOrder('project2', 'view1', ['priority', 'title']);

      expect(getColumnOrder('project1', 'view1')).toEqual(['title', 'status']);
      expect(getColumnOrder('project1', 'view2')).toEqual(['status', 'title']);
      expect(getColumnOrder('project2', 'view1')).toEqual(['priority', 'title']);
    });

    it('setColumnOrder ignores invalid inputs', () => {
      setColumnOrder('', 'view1', ['title']);
      setColumnOrder('project1', '', ['title']);
      setColumnOrder('project1', 'view1', []);

      expect(getColumnOrder('project1', 'view1')).toBeUndefined();
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('keel_ui:tableColumnOrder', '{not json');
      const order = getColumnOrder('project1', 'view1');
      expect(order).toBeUndefined();
    });

    it('handles invalid JSON structure gracefully', () => {
      localStorage.setItem('keel_ui:tableColumnOrder', JSON.stringify({ 'project1::view1': 'not an array' }));
      const order = getColumnOrder('project1', 'view1');
      expect(order).toBeUndefined();
    });

    it('filters out invalid order values', () => {
      localStorage.setItem(
        'keel_ui:tableColumnOrder',
        JSON.stringify({
          'project1::view1': ['title', null, '', 'status', 123],
        })
      );
      const order = getColumnOrder('project1', 'view1');
      expect(order).toEqual(['title', 'status']);
    });

    it('handles builtin columns in order', () => {
      setColumnOrder('project1', 'view1', ['title', '__createdAt', 'status', '__updatedAt']);
      const order = getColumnOrder('project1', 'view1');
      expect(order).toEqual(['title', '__createdAt', 'status', '__updatedAt']);
    });
  });
});
