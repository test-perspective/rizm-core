import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLastViewForProject,
  setLastViewForProject,
  getLastWikiPageForProjectView,
  setLastWikiPageForProjectView,
  safeReadStringMap,
  markReturnToProjectDetailsAfterScmOAuth,
  consumeReturnToProjectDetailsAfterScmOAuth,
} from './storage';

describe('workspace storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns empty map on invalid JSON', () => {
    localStorage.setItem('x', '{bad');
    expect(safeReadStringMap('x')).toEqual({});
  });

  it('stores and loads last view per project', () => {
    setLastViewForProject('p1', 'v1');
    expect(getLastViewForProject('p1')).toBe('v1');
    expect(getLastViewForProject('p2')).toBeUndefined();
  });

  it('stores and loads last wiki page per project view', () => {
    setLastWikiPageForProjectView('p1', 'v1', 'page-1');
    expect(getLastWikiPageForProjectView('p1', 'v1')).toBe('page-1');
    expect(getLastWikiPageForProjectView('p1', 'v2')).toBeUndefined();
  });

  describe('SCM OAuth return-to-project-details', () => {
    it('mark then consume returns true and removes key', () => {
      markReturnToProjectDetailsAfterScmOAuth();
      expect(consumeReturnToProjectDetailsAfterScmOAuth()).toBe(true);
      expect(consumeReturnToProjectDetailsAfterScmOAuth()).toBe(false);
    });

    it('consume without mark returns false', () => {
      expect(consumeReturnToProjectDetailsAfterScmOAuth()).toBe(false);
    });

    it('does not throw when sessionStorage is unavailable', () => {
      const getItem = sessionStorage.getItem.bind(sessionStorage);
      const setItem = sessionStorage.setItem.bind(sessionStorage);
      const removeItem = sessionStorage.removeItem.bind(sessionStorage);
      vi.stubGlobal('sessionStorage', {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {},
      });
      expect(() => markReturnToProjectDetailsAfterScmOAuth()).not.toThrow();
      expect(consumeReturnToProjectDetailsAfterScmOAuth()).toBe(false);
      vi.stubGlobal('sessionStorage', { getItem: getItem, setItem: setItem, removeItem: removeItem });
    });
  });
});
