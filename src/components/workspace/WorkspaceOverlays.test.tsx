import React, { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Entity, ProjectManifest } from '../../types';
import { WorkspaceOverlays } from './WorkspaceOverlays';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const detailPropsRef = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('../CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../AICommandBar', () => ({ AICommandBar: () => null }));
vi.mock('../BoardConfigDialog', () => ({ BoardConfigDialog: () => null }));
vi.mock('../ProjectPolicyDialog', () => ({ ProjectPolicyDialog: () => null }));
vi.mock('../ProjectDetailDialog', () => ({ ProjectDetailDialog: () => null }));
vi.mock('../aiCommandBar/AiProgressDialog', () => ({ AiProgressDialog: () => null }));

vi.mock('../EntityDetailPanelErrorBoundary', () => ({
  EntityDetailPanelErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('../EntityDetailPanel', () => ({
  EntityDetailPanel: (props: Record<string, unknown>) => {
    detailPropsRef.current = props;
    return <div data-testid="entity-detail-panel-mock" />;
  },
}));

const wikiManifest: ProjectManifest = {
  name: 'Proj',
  entities: [
    {
      id: 'wikiPage',
      name: 'Wiki Page',
      namePlural: 'Wiki Pages',
      properties: [{ name: 'doc', type: 'richtext', visible: true }],
      titleLikeProperty: 'title',
    },
    {
      id: 'task',
      name: 'Task',
      namePlural: 'Tasks',
      properties: [
        { name: 'taskKey', type: 'text', visible: true },
        { name: 'title', type: 'text', visible: true },
        { name: 'status', type: 'select', options: ['open'], visible: true },
      ],
      titleLikeProperty: 'title',
    },
  ],
  views: [
    {
      id: 'wikiView',
      name: 'Wiki',
      type: 'wiki',
      entityId: 'wikiPage',
      visibleProperties: ['title', 'doc'],
    },
    {
      id: 'tableView',
      name: 'Tasks',
      type: 'table',
      entityId: 'task',
      visibleProperties: ['taskKey', 'title'],
    },
  ],
  defaultView: 'wikiView',
};

const wikiEntityDef = wikiManifest.entities.find((e) => e.id === 'wikiPage')!;
const taskEntityDef = wikiManifest.entities.find((e) => e.id === 'task')!;

const wikiPageEntity: Entity = {
  id: 'page-1',
  entityId: 'wikiPage',
  createdAt: 0,
  updatedAt: 0,
  properties: { title: 'Home', doc: '' },
};

const taskInstance: Entity = {
  id: 'task-1',
  entityId: 'task',
  createdAt: 0,
  updatedAt: 0,
  properties: { taskKey: 'REQ-1', title: 'Fix bug', status: 'open' },
};

const tableView = wikiManifest.views.find((v) => v.id === 'tableView')!;

type OverlaysProps = React.ComponentProps<typeof WorkspaceOverlays>;

function buildProps(overrides: Partial<OverlaysProps> = {}): OverlaysProps {
  return {
    commandPaletteOpen: false,
    onCommandPaletteOpenChange: vi.fn(),
    aiCommandOpen: false,
    onAICommandOpenChange: vi.fn(),
    onCreateEntity: vi.fn(),
    activeProjectId: 'p1',
    activeProjectKey: 'P1',
    projectKeyById: new Map(),
    onSelectSearchResult: vi.fn(),
    onTransform: vi.fn(),
    onReload: vi.fn().mockResolvedValue(undefined),
    manifest: wikiManifest,
    overlayEntity: null,
    selectedEntityFromUrl: null,
    currentView: wikiManifest.views[0],
    currentEntity: wikiEntityDef,
    currentEntities: [wikiPageEntity],
    effectiveViewId: 'wikiView',
    entities: [],
    onCloseOverlayEntity: vi.fn(),
    onSelectOverlayEntity: vi.fn(),
    onEntityUpdate: vi.fn(),
    onServerEntity: vi.fn(),
    onDeleteEntity: vi.fn(),
    onAddPropertyDefinition: vi.fn().mockResolvedValue(undefined),
    onRemovePropertyDefinition: vi.fn().mockResolvedValue(undefined),
    onReorderProperties: vi.fn().mockResolvedValue(undefined),
    onUpsertPropertyOption: vi.fn(),
    usersById: {},
    onResolveUsers: vi.fn(),
    boardConfigOpen: false,
    onBoardConfigOpenChange: vi.fn(),
    onBoardViewSave: vi.fn(),
    policyDialogOpen: false,
    onPolicyDialogOpenChange: vi.fn(),
    projectNameForPolicy: 'Proj',
    onPolicySaved: vi.fn(),
    projectDetailDialogOpen: false,
    onProjectDetailDialogOpenChange: vi.fn(),
    activeProject: null,
    projectMeta: null,
    onRenameProject: vi.fn().mockResolvedValue(undefined),
    onDeleteProject: vi.fn().mockResolvedValue(undefined),
    onOpenPolicyFromDetail: vi.fn(),
    scmIntegrationEnabled: false,
    progressOpen: false,
    progressTitle: '',
    progressEvents: [],
    progressRunning: false,
    onProgressCancel: vi.fn(),
    onProgressClose: vi.fn(),
    buildPath: ({ projectId, viewId, entityId }) =>
      `/p/${encodeURIComponent(projectId)}/v/${encodeURIComponent(viewId)}${
        entityId ? `/e/${encodeURIComponent(entityId)}` : ''
      }`,
    detailNavEntityIds: [],
    ...overrides,
  };
}

describe('WorkspaceOverlays', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    detailPropsRef.current = null;
    vi.clearAllMocks();
  });

  it('passes task entity definition to EntityDetailPanel when opening a task overlay from wiki', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<WorkspaceOverlays {...buildProps({ overlayEntity: taskInstance })} />);
    });

    expect(detailPropsRef.current).not.toBeNull();
    expect(detailPropsRef.current?.entityTypeId).toBe('task');
    expect(detailPropsRef.current?.properties).toEqual(taskEntityDef.properties);
    expect(detailPropsRef.current?.titleLikeProperty).toBe('title');
    expect(detailPropsRef.current?.allowSchemaEdit).toBe(false);
    expect(detailPropsRef.current?.entity).toEqual(taskInstance);

    act(() => root.unmount());
    container.remove();
  });

  it('does not pass detail arrow navigation callbacks for wiki task overlay', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WorkspaceOverlays
          {...buildProps({
            overlayEntity: taskInstance,
            currentView: wikiManifest.views[0],
            currentEntity: wikiEntityDef,
            currentEntities: [wikiPageEntity],
            effectiveViewId: 'wikiView',
            detailNavEntityIds: ['task-1', 'task-2'],
          })}
        />
      );
    });

    expect(detailPropsRef.current?.onNavigateDetailPrev).toBeUndefined();
    expect(detailPropsRef.current?.onNavigateDetailNext).toBeUndefined();

    act(() => root.unmount());
    container.remove();
  });

  it('passes detail navigation callbacks for table URL detail that call navigate', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WorkspaceOverlays
          {...buildProps({
            overlayEntity: null,
            selectedEntityFromUrl: taskInstance,
            currentView: tableView,
            currentEntity: taskEntityDef,
            currentEntities: [taskInstance],
            effectiveViewId: 'tableView',
            detailNavEntityIds: ['before', 'task-1', 'after'],
          })}
        />
      );
    });

    const prev = detailPropsRef.current?.onNavigateDetailPrev as (() => void) | undefined;
    const next = detailPropsRef.current?.onNavigateDetailNext as (() => void) | undefined;
    expect(prev).toBeTypeOf('function');
    expect(next).toBeTypeOf('function');

    act(() => prev?.());
    expect(mockNavigate).toHaveBeenCalledWith('/p/p1/v/tableView/e/before', { replace: false });

    act(() => next?.());
    expect(mockNavigate).toHaveBeenCalledWith('/p/p1/v/tableView/e/after', { replace: false });

    act(() => root.unmount());
    container.remove();
  });

  it('passes current view entity definition when detail is from URL selection (no overlay)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <WorkspaceOverlays
          {...buildProps({
            overlayEntity: null,
            selectedEntityFromUrl: taskInstance,
            currentView: tableView,
            currentEntity: taskEntityDef,
            currentEntities: [taskInstance],
            effectiveViewId: 'tableView',
          })}
        />
      );
    });

    expect(detailPropsRef.current?.entityTypeId).toBe('task');
    expect(detailPropsRef.current?.properties).toEqual(taskEntityDef.properties);
    expect(detailPropsRef.current?.allowSchemaEdit).toBe(true);

    act(() => root.unmount());
    container.remove();
  });
});
