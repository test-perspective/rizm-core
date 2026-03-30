import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getColumnVisibility, setColumnVisibility } from './tableColumnVisibilityPrefs';

describe('tableColumnVisibilityPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getColumnVisibility returns undefined when no preferences exist', () => {
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toBeUndefined();
  });

  it('setColumnVisibility and getColumnVisibility round-trip', () => {
    const visibility = {
      title: true,
      status: false,
      priority: true,
    };
    setColumnVisibility('project1', 'view1', visibility);
    const retrieved = getColumnVisibility('project1', 'view1');
    expect(retrieved).toEqual(visibility);
  });

  it('setColumnVisibility merges with existing preferences', () => {
    setColumnVisibility('project1', 'view1', {
      title: true,
      status: false,
    });
    setColumnVisibility('project1', 'view1', {
      priority: true,
      __createdAt: true,
    });
    const retrieved = getColumnVisibility('project1', 'view1');
    expect(retrieved).toEqual({
      title: true,
      status: false,
      priority: true,
      __createdAt: true,
    });
  });

  it('preferences are isolated per project + view', () => {
    setColumnVisibility('project1', 'view1', { title: true, status: false });
    setColumnVisibility('project1', 'view2', { title: false, status: true });
    setColumnVisibility('project2', 'view1', { title: false, priority: true });

    expect(getColumnVisibility('project1', 'view1')).toEqual({ title: true, status: false });
    expect(getColumnVisibility('project1', 'view2')).toEqual({ title: false, status: true });
    expect(getColumnVisibility('project2', 'view1')).toEqual({ title: false, priority: true });
  });

  it('setColumnVisibility ignores invalid inputs', () => {
    setColumnVisibility('', 'view1', { title: true });
    setColumnVisibility('project1', '', { title: true });
    setColumnVisibility('project1', 'view1', {});

    expect(getColumnVisibility('project1', 'view1')).toBeUndefined();
  });

  it('handles corrupted localStorage gracefully', () => {
    // Simulate corrupted data
    localStorage.setItem('keel_ui:tableColumnVisibility', '{not json');
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toBeUndefined();
  });

  it('handles invalid JSON structure gracefully', () => {
    // Simulate invalid structure
    localStorage.setItem('keel_ui:tableColumnVisibility', JSON.stringify({ 'project1::view1': 'not an object' }));
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toBeUndefined();
  });

  it('filters out invalid visibility values', () => {
    // Manually set invalid data
    localStorage.setItem(
      'keel_ui:tableColumnVisibility',
      JSON.stringify({
        'project1::view1': {
          title: true,
          status: 'invalid',
          priority: null,
          empty: undefined,
        },
      })
    );
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toEqual({ title: true });
  });

  it('setColumnVisibility updates existing visibility', () => {
    setColumnVisibility('project1', 'view1', { title: true, status: false });
    setColumnVisibility('project1', 'view1', { title: false, status: true });
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toEqual({ title: false, status: true });
  });

  it('handles builtin columns (__createdAt, __updatedAt, __id)', () => {
    setColumnVisibility('project1', 'view1', {
      title: true,
      __createdAt: true,
      __updatedAt: false,
      __id: true,
    });
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toEqual({
      title: true,
      __createdAt: true,
      __updatedAt: false,
      __id: true,
    });
  });

  it('handles __latestComment column', () => {
    setColumnVisibility('project1', 'view1', {
      title: true,
      __latestComment: false,
    });
    const visibility = getColumnVisibility('project1', 'view1');
    expect(visibility).toEqual({
      title: true,
      __latestComment: false,
    });
  });
});
