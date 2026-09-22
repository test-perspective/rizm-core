import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import type { Entity, MoveTasksResponse } from '../../types';
import { moveTasks } from '../../api/tasks';
import { TaskMoveDialog } from './TaskMoveDialog';

// The picker has its own coverage; here it only has to report a destination.
vi.mock('../common/ProjectSelect', () => ({
  ProjectSelect: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" data-testid="pick-destination" onClick={() => onChange('p2')}>
      pick
    </button>
  ),
}));

function task(id: string, taskKey: string, properties: Record<string, unknown> = {}): Entity {
  return {
    id,
    entityId: 'task',
    createdAt: 0,
    updatedAt: 0,
    properties: { taskKey, title: `Title ${taskKey}`, ...properties },
  };
}

const projects = [
  { id: 'p1', name: 'Source', createdAt: 0, updatedAt: 0 },
  { id: 'p2', name: 'Destination', createdAt: 0, updatedAt: 0 },
];

const response: MoveTasksResponse = {
  sourceProjectId: 'p1',
  destinationProjectId: 'p2',
  destinationProjectKey: 'BBB',
  moved: [{ id: 't1', previousTaskKey: 'AAA-1', taskKey: 'BBB-1', title: 'Title AAA-1' }],
  detachedRelations: [],
  manifestUpdated: false,
};

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).process.env.VITE_KEEL_BACKEND_URL = 'http://backend.test';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete (globalThis as any).process.env.VITE_KEEL_BACKEND_URL;
});

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

async function render(props: Partial<React.ComponentProps<typeof TaskMoveDialog>> = {}) {
  const entities = props.entities ?? [task('t1', 'AAA-1')];
  const onMoved = vi.fn();
  const onClose = vi.fn();
  await act(async () => {
    root.render(
      <TaskMoveDialog
        open
        onClose={onClose}
        sourceProjectId="p1"
        roots={[entities[0]]}
        entities={entities}
        projects={projects}
        // Goes through the real API client so the request body is what ships.
        onMove={(destinationProjectId, taskIds) =>
          moveTasks('p1', { destinationProjectId, taskIds })
        }
        onMoved={onMoved}
        {...props}
      />
    );
  });
  return { onMoved, onClose };
}

function query(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

async function click(testId: string) {
  const el = query(testId);
  if (!el) throw new Error(`missing ${testId}`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('TaskMoveDialog', () => {
  it('counts the subtasks that come along', async () => {
    await render({
      entities: [task('t1', 'AAA-1'), task('t2', 'AAA-2', { parentTaskKey: 'AAA-1' })],
    });
    expect(query('task-move-summary')?.textContent).toBe(
      'Moving 1 task and 1 subtask (2 total).'
    );
    expect(query('task-move-task-list')?.textContent).toContain('AAA-2');
  });

  it('warns about references that will be cut', async () => {
    await render({
      entities: [task('t1', 'AAA-1', { blockedBy: ['AAA-9'] }), task('t9', 'AAA-9')],
    });
    const detached = query('task-move-detached');
    expect(detached?.textContent).toContain('AAA-1');
    expect(detached?.textContent).toContain('blockedBy');
  });

  it('sends the whole move set and closes on success', async () => {
    fetchMock.mockResolvedValue(ok(response));
    const { onMoved, onClose } = await render({
      entities: [task('t1', 'AAA-1'), task('t2', 'AAA-2', { parentTaskKey: 'AAA-1' })],
    });

    await click('pick-destination');
    await click('task-move-confirm');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://backend.test/api/projects/p1/tasks/move');
    expect(JSON.parse(init.body)).toEqual({
      destinationProjectId: 'p2',
      taskIds: ['t1', 't2'],
    });
    expect(onMoved).toHaveBeenCalledWith(response);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open and shows why when the move fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'insufficient permissions for project BBB',
    } as unknown as Response);
    const { onMoved, onClose } = await render();

    await click('pick-destination');
    await click('task-move-confirm');

    expect(query('task-move-error')?.textContent).toBe('insufficient permissions for project BBB');
    expect(onMoved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cannot be confirmed before a destination is chosen', async () => {
    await render();
    const confirm = query('task-move-confirm') as HTMLButtonElement | null;
    expect(confirm?.disabled).toBe(true);
  });
});
