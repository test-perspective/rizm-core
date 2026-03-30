import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultWidth,
  getMaxWidth,
  getMinWidth,
  getPageListWidth,
  setPageListWidth,
} from './wikiPageListWidthPrefs';

describe('wikiPageListWidthPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getDefaultWidth returns 288', () => {
    expect(getDefaultWidth()).toBe(288);
  });

  it('getMinWidth returns 200', () => {
    expect(getMinWidth()).toBe(200);
  });

  it('getPageListWidth returns undefined when no preference exists', () => {
    const width = getPageListWidth('project1', 'view1');
    expect(width).toBeUndefined();
  });

  it('setPageListWidth and getPageListWidth round-trip', () => {
    setPageListWidth('project1', 'view1', 400);
    const width = getPageListWidth('project1', 'view1');
    expect(width).toBe(400);
  });

  it('setPageListWidth updates existing width', () => {
    setPageListWidth('project1', 'view1', 300);
    setPageListWidth('project1', 'view1', 450);
    const width = getPageListWidth('project1', 'view1');
    expect(width).toBe(450);
  });

  it('preferences are isolated per project + view', () => {
    setPageListWidth('project1', 'view1', 300);
    setPageListWidth('project1', 'view2', 400);
    setPageListWidth('project2', 'view1', 500);

    expect(getPageListWidth('project1', 'view1')).toBe(300);
    expect(getPageListWidth('project1', 'view2')).toBe(400);
    expect(getPageListWidth('project2', 'view1')).toBe(500);
  });

  it('getPageListWidth works with undefined viewId', () => {
    setPageListWidth('project1', undefined, 350);
    const width = getPageListWidth('project1', undefined);
    expect(width).toBe(350);
  });

  it('setPageListWidth ignores invalid inputs', () => {
    setPageListWidth('', 'view1', 300);
    setPageListWidth('project1', 'view1', 100);
    setPageListWidth('project1', 'view1', 0);
    setPageListWidth('project1', 'view1', -50);

    expect(getPageListWidth('project1', 'view1')).toBeUndefined();
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('keel_ui:wikiPageListWidth', '{not json');
    const width = getPageListWidth('project1', 'view1');
    expect(width).toBeUndefined();
  });

  it('handles invalid JSON structure gracefully', () => {
    localStorage.setItem(
      'keel_ui:wikiPageListWidth',
      JSON.stringify({ 'project1::view1': 'not a number' })
    );
    const width = getPageListWidth('project1', 'view1');
    expect(width).toBeUndefined();
  });

  it('filters out width below MIN_WIDTH', () => {
    localStorage.setItem(
      'keel_ui:wikiPageListWidth',
      JSON.stringify({ 'project1::view1': 150 })
    );
    const width = getPageListWidth('project1', 'view1');
    expect(width).toBeUndefined();
  });

  it('getMaxWidth returns value based on window', () => {
    const maxW = getMaxWidth();
    expect(maxW).toBeGreaterThan(0);
    expect(typeof maxW).toBe('number');
  });
});
