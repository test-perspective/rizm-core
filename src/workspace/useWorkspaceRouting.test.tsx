import { useState } from 'react';
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { useWorkspaceRouting } from './useWorkspaceRouting';
import type { Entity, ProjectManifest, ProjectMeta } from '../types';

const now = 1;
const meta = (id: string): ProjectMeta => ({
  id,
  name: id,
  projectKey: id.toUpperCase(),
  createdAt: now,
  updatedAt: now,
});

const minimalManifest: ProjectManifest = {
  name: 'M',
  entities: [
    {
      id: 'ent1',
      name: 'E',
      namePlural: 'Es',
      properties: [],
    },
  ],
  views: [
    {
      id: 'v1',
      name: 'V',
      type: 'board',
      entityId: 'ent1',
      visibleProperties: [],
    },
  ],
  defaultView: 'v1',
};

const emptyEntities: Entity[] = [];

function RoutingHarness(props: {
  projects: ProjectMeta[];
  initialActiveId: string;
  urlProjectId?: string;
  manifest: ProjectManifest | null;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  onSetActive: (id: string) => void;
}) {
  const [activeProjectId, setActiveProjectId] = useState(props.initialActiveId);
  useWorkspaceRouting({
    loading: false,
    manifest: props.manifest,
    entities: emptyEntities,
    projects: props.projects,
    activeProjectId,
    setActiveProjectId: (id) => {
      props.onSetActive(id);
      setActiveProjectId(id);
    },
    urlProjectId: props.urlProjectId,
    urlViewId: 'v1',
    urlEntityId: undefined,
    locationPathname: '/p/x/v/v1',
    navigate: props.onNavigate,
    pendingUrlProjectId: null,
    clearPendingUrlProjectId: () => {},
  });
  return null;
}

describe('useWorkspaceRouting', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('does not set active project from URL when URL project is not in the list; navigates to current active instead', async () => {
    const onNavigate = vi.fn();
    const onSetActive = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <RoutingHarness
          projects={[meta('project-b')]}
          initialActiveId="project-b"
          urlProjectId="deleted-project"
          manifest={null}
          onNavigate={onNavigate}
          onSetActive={onSetActive}
        />
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSetActive).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('/p/project-b', { replace: true });
    root.unmount();
    document.body.removeChild(container);
  });

  it('syncs active project from URL when URL project exists in the list', async () => {
    const onNavigate = vi.fn();
    const onSetActive = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <RoutingHarness
          projects={[meta('project-a'), meta('project-b')]}
          initialActiveId="project-b"
          urlProjectId="project-a"
          manifest={minimalManifest}
          onNavigate={onNavigate}
          onSetActive={onSetActive}
        />
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSetActive).toHaveBeenCalledWith('project-a');
    root.unmount();
    document.body.removeChild(container);
  });
});
