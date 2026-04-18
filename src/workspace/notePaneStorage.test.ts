import { describe, it, expect, beforeEach } from 'vitest';
import { getNotePanePrefs, setNotePanePrefs } from './notePaneStorage';

describe('notePaneStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when nothing stored', () => {
    const p = getNotePanePrefs('proj', 'view1');
    expect(p.open).toBe(false);
    expect(p.pageId).toBeNull();
    expect(p.widthPx).toBeGreaterThanOrEqual(240);
    expect(p.widthPx).toBeLessThanOrEqual(900);
  });

  it('stores and loads open, pageId, and width', () => {
    setNotePanePrefs('proj', 'view1', { open: true, pageId: 'page-a', widthPx: 400 });
    const p = getNotePanePrefs('proj', 'view1');
    expect(p.open).toBe(true);
    expect(p.pageId).toBe('page-a');
    expect(p.widthPx).toBe(400);
  });

  it('isolates keys by project and view', () => {
    setNotePanePrefs('p1', 'v1', { open: true, pageId: 'a', widthPx: 300 });
    setNotePanePrefs('p1', 'v2', { open: false, pageId: 'b', widthPx: 500 });
    expect(getNotePanePrefs('p1', 'v1').pageId).toBe('a');
    expect(getNotePanePrefs('p1', 'v2').pageId).toBe('b');
    expect(getNotePanePrefs('p2', 'v1').open).toBe(false);
  });

  it('clamps width to bounds', () => {
    setNotePanePrefs('p', 'v', { open: true, pageId: 'x', widthPx: 50 });
    expect(getNotePanePrefs('p', 'v').widthPx).toBe(240);
    setNotePanePrefs('p', 'v', { open: true, pageId: 'x', widthPx: 9999 });
    expect(getNotePanePrefs('p', 'v').widthPx).toBe(900);
  });
});
