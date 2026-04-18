import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, EntityDefinition, ViewConfig } from '../../types';
import { WorkspaceViewPanel, type WorkspaceNotesPaneConfig } from './WorkspaceViewPanel';

vi.mock('../BoardView', () => ({
  BoardView: () => <div data-testid="board-mock">board</div>,
}));

vi.mock('../TableView', () => ({
  TableView: () => <div data-testid="table-mock">table</div>,
}));

vi.mock('../WikiView', () => ({
  WikiView: () => <div data-testid="wiki-mock">wiki</div>,
}));

vi.mock('../wiki/EmbeddedWikiNotePane', () => ({
  EmbeddedWikiNotePane: () => <div data-testid="embedded-wiki-mock">wiki</div>,
}));

vi.mock('./WorkspaceNoteSplit', () => ({
  WorkspaceNoteSplit: ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
    <div data-testid="workspace-note-split">
      <div data-testid="split-left">{left}</div>
      <div data-testid="split-right">{right}</div>
    </div>
  ),
}));

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

const noop = () => {};
const noopAsync = async () => {};

describe('WorkspaceViewPanel REQ-288 notes pane', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('renders WorkspaceNoteSplit with embedded wiki when notesPane is set on board view', () => {
    const notesPane: WorkspaceNotesPaneConfig = {
      wikiViewId: 'wiki-view',
      wikiPages: [],
      pageId: 'p1',
      widthPx: 320,
      onPageIdChange: noop,
      onClose: noop,
      onWidthChangeEnd: noop,
      onWikiCreate: () =>
        ({ id: 'x', entityId: 'wikiPage', createdAt: 0, updatedAt: 0, properties: {} }) as Entity,
      onWikiDelete: noop,
      onWikiUpdate: noop,
      onWikiEntityClick: noop,
      onRefreshProject: noopAsync,
      onServerEntity: noop,
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WorkspaceViewPanel
          currentView={boardView}
          currentEntity={taskEntity}
          currentEntities={[]}
          entities={[]}
          projects={[]}
          activeProjectId="proj"
          activeProjectKey="P"
          scmIntegrationEnabled={false}
          effectiveViewId="v-board"
          selectedWikiPageId={null}
          usersById={{}}
          onResolveUsers={noop}
          onNavigateEntity={noop}
          onEntityUpdate={noop}
          onUpsertPropertyOption={noop}
          onViewConfigUpdate={noop}
          onRefreshProject={noopAsync}
          onWikiSelect={noop}
          onWikiCreate={() =>
            ({ id: 'x', entityId: 'wikiPage', createdAt: 0, updatedAt: 0, properties: {} }) as Entity
          }
          onWikiDelete={noop}
          onWikiUpdate={noop}
          onWikiEntityClick={noop}
          onServerEntity={noop}
          notesPane={notesPane}
        />
      );
    });

    expect(container.querySelector('[data-testid="workspace-note-split"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="embedded-wiki-mock"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="board-mock"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders BoardView only when notesPane is null', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WorkspaceViewPanel
          currentView={boardView}
          currentEntity={taskEntity}
          currentEntities={[]}
          entities={[]}
          projects={[]}
          activeProjectId="proj"
          activeProjectKey="P"
          scmIntegrationEnabled={false}
          effectiveViewId="v-board"
          selectedWikiPageId={null}
          usersById={{}}
          onResolveUsers={noop}
          onNavigateEntity={noop}
          onEntityUpdate={noop}
          onUpsertPropertyOption={noop}
          onViewConfigUpdate={noop}
          onRefreshProject={noopAsync}
          onWikiSelect={noop}
          onWikiCreate={() =>
            ({ id: 'x', entityId: 'wikiPage', createdAt: 0, updatedAt: 0, properties: {} }) as Entity
          }
          onWikiDelete={noop}
          onWikiUpdate={noop}
          onWikiEntityClick={noop}
          onServerEntity={noop}
          notesPane={null}
        />
      );
    });

    expect(container.querySelector('[data-testid="workspace-note-split"]')).toBeNull();
    expect(container.querySelector('[data-testid="board-mock"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
