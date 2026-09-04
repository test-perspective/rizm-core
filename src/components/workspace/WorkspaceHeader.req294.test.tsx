import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EntityDefinition, ViewConfig } from '../../types';
import { WorkspaceHeader } from './WorkspaceHeader';

const taskEntity: EntityDefinition = {
  id: 'task',
  name: 'Task',
  namePlural: 'Tasks',
  properties: [{ name: 'title', type: 'text' }],
};

const boardView: ViewConfig = {
  id: 'v-board',
  name: 'Board',
  type: 'board',
  entityId: 'task',
  groupBy: 'status',
  visibleProperties: ['title'],
  columnOrder: ['Todo'],
};

describe('WorkspaceHeader REQ-294 notes chrome project menu order', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('places project overflow menu to the right of the project select (split / notes chrome row)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WorkspaceHeader
          currentView={boardView}
          currentEntity={taskEntity}
          currentEntities={[]}
          onOpenCommandPalette={vi.fn()}
          onCreateEntity={vi.fn()}
          onOpenBoardConfig={vi.fn()}
          notesChrome={{
            projects: [{ id: 'p1', name: 'Alpha', projectKey: 'REQ', createdAt: 0, updatedAt: 0 }],
            activeProjectId: 'p1',
            onProjectChange: vi.fn(),
            visibleViews: [boardView],
            currentViewId: 'v-board',
            onViewChange: vi.fn(),
            onOpenProjectDetail: vi.fn(),
            onAddProject: vi.fn(),
          }}
        />
      );
    });

    const chrome = container.querySelector('[data-testid="workspace-header-notes-chrome"]');
    expect(chrome).not.toBeNull();
    // REQ-312: project picker is now an Autocomplete input, not a native select.
    const projectSelect = chrome!.querySelector(
      '[data-testid="workspace-header-project-select"]'
    ) as HTMLInputElement;
    const overflowBtn = chrome!.querySelector(
      '[data-testid="workspace-header-project-overflow-menu"]'
    ) as HTMLButtonElement;
    expect(projectSelect).not.toBeNull();
    expect(overflowBtn).not.toBeNull();

    const pos = projectSelect.compareDocumentPosition(overflowBtn);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
