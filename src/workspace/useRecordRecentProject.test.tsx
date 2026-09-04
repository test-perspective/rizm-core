import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectMeta } from '../types';
import { getRecentProjectIds } from '../utils/recentProjects';
import { useRecordRecentProject } from './useRecordRecentProject';

const meta = (id: string): ProjectMeta => ({
  id,
  name: id,
  projectKey: id.toUpperCase(),
  createdAt: 0,
  updatedAt: 0,
});

const PROJECTS = [meta('alpha'), meta('bravo'), meta('charlie')];

function Harness(props: { loading: boolean; projects: ProjectMeta[]; activeProjectId: string }) {
  useRecordRecentProject(props);
  return null;
}

describe('useRecordRecentProject (REQ-312)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (props: { loading: boolean; projects: ProjectMeta[]; activeProjectId: string }) => {
    act(() => {
      root.render(<Harness {...props} />);
    });
  };

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('records the project that is actually displayed', () => {
    render({ loading: false, projects: PROJECTS, activeProjectId: 'bravo' });

    expect(getRecentProjectIds()).toEqual(['bravo']);
  });

  it('records each visited project most-recent-first', () => {
    render({ loading: false, projects: PROJECTS, activeProjectId: 'bravo' });
    render({ loading: false, projects: PROJECTS, activeProjectId: 'charlie' });
    render({ loading: false, projects: PROJECTS, activeProjectId: 'alpha' });
    render({ loading: false, projects: PROJECTS, activeProjectId: 'charlie' });

    expect(getRecentProjectIds()).toEqual(['charlie', 'alpha', 'bravo']);
  });

  it('waits until loading finishes', () => {
    render({ loading: true, projects: PROJECTS, activeProjectId: 'bravo' });
    expect(getRecentProjectIds()).toEqual([]);

    render({ loading: false, projects: PROJECTS, activeProjectId: 'bravo' });
    expect(getRecentProjectIds()).toEqual(['bravo']);
  });

  it('ignores an active project that is not in the readable project list', () => {
    render({ loading: false, projects: PROJECTS, activeProjectId: 'no-access' });
    expect(getRecentProjectIds()).toEqual([]);

    // 一覧がまだ空の初期表示でも記録しない。
    render({ loading: false, projects: [], activeProjectId: 'alpha' });
    expect(getRecentProjectIds()).toEqual([]);
  });

  it('ignores an empty active project id', () => {
    render({ loading: false, projects: PROJECTS, activeProjectId: '' });

    expect(getRecentProjectIds()).toEqual([]);
  });
});
