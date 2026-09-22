import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity } from '../../types';
import { TaskLinkInline, findEntityByTaskKey, type TaskLinkInlineDeps } from './TaskLinkInline';

const task = (id: string, taskKey: string): Entity => ({
  id,
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: { taskKey, title: taskKey },
});

function makeDeps(entities: Entity[], onEntityClick?: (e: Entity) => void): TaskLinkInlineDeps {
  return {
    entitiesRef: { current: entities },
    onEntityClickRef: { current: onEntityClick },
    isMountedRef: { current: true },
  };
}

function render(taskKey: string, deps: TaskLinkInlineDeps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TaskLinkInline taskKey={taskKey} deps={deps} />);
  });
  const span = container.querySelector('span') as HTMLElement;
  return {
    container,
    span,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('TaskLinkInline', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  // The click handler defers through requestAnimationFrame then setTimeout(0); fake timers drive
  // both so the assertions stay synchronous.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('findEntityByTaskKey', () => {
    it('matches on the trimmed taskKey property', () => {
      const entities = [task('a', ' REQ-1 '), task('b', 'REQ-2')];
      expect(findEntityByTaskKey(entities, 'REQ-1')?.id).toBe('a');
      expect(findEntityByTaskKey(entities, 'REQ-2')?.id).toBe('b');
      expect(findEntityByTaskKey(entities, 'REQ-3')).toBeUndefined();
    });

    it('matches a key the task held before it was moved here (REQ-309)', () => {
      const moved = task('m', 'OPS-4');
      moved.properties.previousTaskKeys = ['REQ-1'];
      expect(findEntityByTaskKey([moved], 'REQ-1')?.id).toBe('m');
      expect(findEntityByTaskKey([moved], 'OPS-4')?.id).toBe('m');
    });

    it('prefers the task holding the key now over one that used to', () => {
      const moved = task('m', 'OPS-4');
      moved.properties.previousTaskKeys = ['REQ-1'];
      const current = task('c', 'REQ-1');
      expect(findEntityByTaskKey([moved, current], 'REQ-1')?.id).toBe('c');
    });
  });

  describe('resolved key (active project)', () => {
    it('renders the chip and opens the entity on mousedown', () => {
      const onEntityClick = vi.fn();
      const entity = task('t1', 'REQ-1');
      const { span, cleanup } = render('REQ-1', makeDeps([entity], onEntityClick));

      expect(span.hasAttribute('data-keel-task-link')).toBe(true);
      expect(span.getAttribute('data-keel-task-link-state')).toBe('linked');
      expect(span.className).toContain('underline');
      expect(span.className).not.toContain('line-through');
      expect(span.getAttribute('title')).toBe('Click to open: REQ-1');
      expect(span.textContent).toBe('REQ-1');

      act(() => {
        span.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        vi.advanceTimersByTime(50);
      });

      expect(onEntityClick).toHaveBeenCalledTimes(1);
      expect(onEntityClick).toHaveBeenCalledWith(entity);
      cleanup();
    });

    it('does not open the entity once the editor is unmounted', () => {
      const onEntityClick = vi.fn();
      const deps = makeDeps([task('t1', 'REQ-1')], onEntityClick);
      const { span, cleanup } = render('REQ-1', deps);

      act(() => {
        span.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        deps.isMountedRef.current = false;
        vi.advanceTimersByTime(50);
      });

      expect(onEntityClick).not.toHaveBeenCalled();
      cleanup();
    });
  });

  describe('unresolved key', () => {
    // REQ-311: a key belonging to another project is simply absent from the active project's
    // entities, so it must render as plain prose instead of a struck-through dead chip.
    it('renders a key from another project as plain text', () => {
      const onEntityClick = vi.fn();
      const { span, cleanup } = render('OTHER-7', makeDeps([task('t1', 'REQ-1')], onEntityClick));

      expect(span.getAttribute('data-keel-task-link-state')).toBe('unresolved');
      expect(span.hasAttribute('data-keel-task-link')).toBe(false);
      expect(span.className).toBe('');
      expect(span.className).not.toContain('line-through');
      expect(span.hasAttribute('title')).toBe(false);
      expect(span.getAttribute('style')).toBeNull();
      expect(span.textContent).toBe('OTHER-7');

      act(() => {
        span.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        vi.advanceTimersByTime(50);
      });

      expect(onEntityClick).not.toHaveBeenCalled();
      cleanup();
    });

    it('renders a deleted key from the active project as plain text too', () => {
      const { span, cleanup } = render('REQ-9999', makeDeps([task('t1', 'REQ-1')]));

      expect(span.className).not.toContain('line-through');
      expect(span.hasAttribute('title')).toBe(false);
      expect(span.textContent).toBe('REQ-9999');
      cleanup();
    });
  });
});
