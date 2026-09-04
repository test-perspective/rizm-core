import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectMeta } from '../../types';
import {
  getRecentProjectIds,
  PROJECT_OPTIONS_MAX,
  recordRecentProject,
} from '../../utils/recentProjects';
import {
  PROJECT_SELECT_GROUP_ALL,
  PROJECT_SELECT_GROUP_RECENT,
  PROJECT_SELECT_POPPER_MIN_WIDTH_PX,
  ProjectSelect,
} from './ProjectSelect';

const project = (id: string, name: string, projectKey?: string): ProjectMeta => ({
  id,
  name,
  projectKey,
  createdAt: 0,
  updatedAt: 0,
});

const PROJECTS: ProjectMeta[] = [
  project('apollo', 'Apollo', 'APO'),
  project('beacon', 'Beacon', 'BCN'),
  project('cascade', 'Cascade', 'CAS'),
];

/**
 * MUI Autocomplete は input が focus されていないと入力値を選択中の値へ戻すため、
 * 打ち込む前に必ず focus させる。
 */
const typeInto = (input: HTMLInputElement, value: string): void => {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const optionTexts = (): string[] =>
  [...document.querySelectorAll('[role="option"]')].map((el) => el.textContent ?? '');

const groupLabels = (): string[] =>
  [...document.querySelectorAll('[data-testid^="project-select-group-"]')].map(
    (el) => el.textContent ?? ''
  );

const optionTextsInGroup = (testId: string): string[] => {
  const header = document.querySelector(`[data-testid="${testId}"]`);
  const groupLi = header?.closest('li');
  return [...(groupLi?.querySelectorAll('[role="option"]') ?? [])].map(
    (el) => el.textContent ?? ''
  );
};

describe('ProjectSelect (REQ-312 / REQ-318)', () => {
  let container: HTMLDivElement;
  let root: Root;

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

  const render = (
    onChange: (id: string) => void,
    value = 'apollo',
    projects: ProjectMeta[] = PROJECTS
  ) => {
    act(() => {
      root.render(
        <ProjectSelect
          projects={projects}
          value={value}
          onChange={onChange}
          testId="project-select"
        />
      );
    });
    return container.querySelector('[data-testid="project-select"]') as HTMLInputElement;
  };

  const truncationNote = (): string | null =>
    document.querySelector('[data-testid="project-select-truncation"]')?.textContent ?? null;

  it('shows the selected project (name and key) in the input', () => {
    const input = render(vi.fn());
    expect(input).not.toBeNull();
    expect(input.value).toBe('Apollo (APO)');
    expect(input.getAttribute('aria-label')).toBe('Project');
  });

  it('narrows the options as the user types, matching name or project key', () => {
    const input = render(vi.fn());

    act(() => {
      typeInto(input, 'bea');
    });
    expect(optionTexts()).toEqual(['BeaconBCN']);

    act(() => {
      typeInto(input, 'bcn'); // project key also matches
    });
    expect(optionTexts()).toEqual(['BeaconBCN']);

    act(() => {
      typeInto(input, 'cas');
    });
    expect(optionTexts()).toEqual(['CascadeCAS']);
  });

  it('lists every project (recently displayed first) when the field is focused without typing', () => {
    recordRecentProject('cascade');
    const input = render(vi.fn());

    act(() => {
      input.focus();
    });

    expect(optionTexts()).toEqual(['CascadeCAS', 'ApolloAPO', 'BeaconBCN']);
  });

  it('picks up projects displayed after mount when reopened', () => {
    const input = render(vi.fn());

    recordRecentProject('beacon');
    act(() => {
      input.focus();
    });

    expect(optionTexts()).toEqual(['BeaconBCN', 'ApolloAPO', 'CascadeCAS']);
  });

  it('caps the list and says how many projects are hidden', () => {
    const many = Array.from({ length: PROJECT_OPTIONS_MAX + 12 }, (_, i) =>
      project(`p${i}`, `Project ${String(i).padStart(3, '0')}`)
    );
    const input = render(vi.fn(), 'p0', many);

    act(() => {
      input.focus();
    });
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(PROJECT_OPTIONS_MAX);
    expect(truncationNote()).toBe('12 more — type to narrow');

    // 絞り込んで上限内に収まったら注記は消える。
    act(() => {
      typeInto(input, 'Project 05');
    });
    expect(document.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(
      PROJECT_OPTIONS_MAX
    );
    expect(truncationNote()).toBeNull();
  });

  it('selects the highlighted project with Enter', () => {
    const onChange = vi.fn();
    const input = render(onChange);

    act(() => {
      typeInto(input, 'bea');
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('beacon');
    // 「最近表示した順」は表示側 (useRecordRecentProject) が記録する担当なので、ここでは書かない。
    expect(getRecentProjectIds()).toEqual([]);
  });

  it('restores the selected label when the user abandons a partial query', () => {
    const input = render(vi.fn());

    act(() => {
      typeInto(input, 'zzz');
    });
    expect(optionTexts()).toEqual([]);

    act(() => {
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(input.value).toBe('Apollo (APO)');
  });

  it('groups recents and the rest under section headings', () => {
    recordRecentProject('cascade');
    recordRecentProject('beacon');
    const input = render(vi.fn());

    act(() => {
      input.focus();
    });

    expect(groupLabels()).toEqual([PROJECT_SELECT_GROUP_RECENT, PROJECT_SELECT_GROUP_ALL]);
    expect(optionTextsInGroup('project-select-group-recent')).toEqual([
      'BeaconBCN',
      'CascadeCAS',
    ]);
    expect(optionTextsInGroup('project-select-group-all')).toEqual(['ApolloAPO']);
    expect(optionTexts()).toEqual(['BeaconBCN', 'CascadeCAS', 'ApolloAPO']);
  });

  it('keeps matching options in their groups after the user types', () => {
    recordRecentProject('cascade');
    recordRecentProject('beacon');
    const input = render(vi.fn());

    act(() => {
      typeInto(input, 'a');
    });

    // Beacon / Cascade / Apollo all contain "a"; recents stay in Recent.
    expect(groupLabels()).toEqual([PROJECT_SELECT_GROUP_RECENT, PROJECT_SELECT_GROUP_ALL]);
    expect(optionTextsInGroup('project-select-group-recent')).toEqual([
      'BeaconBCN',
      'CascadeCAS',
    ]);
    expect(optionTextsInGroup('project-select-group-all')).toEqual(['ApolloAPO']);
  });

  it('hides an empty Recent section when nothing is recent', () => {
    const input = render(vi.fn());

    act(() => {
      input.focus();
    });

    expect(groupLabels()).toEqual([PROJECT_SELECT_GROUP_ALL]);
    expect(optionTextsInGroup('project-select-group-all')).toEqual([
      'ApolloAPO',
      'BeaconBCN',
      'CascadeCAS',
    ]);
  });

  it('applies a min-width so the dropdown is wider than a narrow trigger', () => {
    const input = render(vi.fn());

    act(() => {
      input.focus();
    });

    const popper = document.querySelector('.MuiAutocomplete-popper') as HTMLElement;
    expect(popper).not.toBeNull();
    expect(PROJECT_SELECT_POPPER_MIN_WIDTH_PX).toBe(320);
    const styleText = [...document.querySelectorAll('style')]
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(styleText).toContain(`min-width:${PROJECT_SELECT_POPPER_MIN_WIDTH_PX}px`);
  });

  it('keeps the menu in the viewport without a visible scrollbar', () => {
    const many = Array.from({ length: 23 }, (_, i) =>
      project(`p${i}`, `Project ${String(i).padStart(2, '0')}`)
    );
    const input = render(vi.fn(), 'p0', many);

    act(() => {
      input.focus();
    });

    const listbox = document.querySelector('.MuiAutocomplete-listbox') as HTMLElement;
    expect(listbox).not.toBeNull();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(23);

    const styleText = [...document.querySelectorAll('style')]
      .map((el) => el.textContent ?? '')
      .join('\n');
    expect(styleText).toContain('max-height:none');
    expect(styleText).toContain('overflow-x:hidden');
    expect(styleText).toContain('scrollbar-width:none');
  });
});
