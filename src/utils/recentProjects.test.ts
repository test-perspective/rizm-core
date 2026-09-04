import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectMeta } from '../types';
import {
  buildProjectOptions,
  DEFAULT_RECENT_PROJECTS_PINNED_COUNT,
  formatProjectLabel,
  getRecentProjectIds,
  matchProjects,
  PROJECT_OPTIONS_MAX,
  recordRecentProject,
  RECENT_PROJECTS_MAX_SIZE,
} from './recentProjects';

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
  project('delta', 'Delta', 'DLT'),
  project('echo', 'Echo'),
];

const ids = (projects: ProjectMeta[]): string[] => projects.map((p) => p.id);

/** 実際の使い方どおり「並べ替え → 絞り込み → 打ち切り」を通した結果 (ProjectSelect と同じ順序)。 */
const optionIds = (
  inputValue: string,
  pinnedCount?: number,
  max: number = PROJECT_OPTIONS_MAX,
  projects: ProjectMeta[] = PROJECTS
): string[] =>
  ids(
    matchProjects(
      buildProjectOptions({
        projects,
        recentProjectIds: getRecentProjectIds(),
        pinnedCount,
      }),
      inputValue
    ).slice(0, max)
  );

describe('recentProjects', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('formats the label with the project key when present', () => {
    expect(formatProjectLabel(project('apollo', 'Apollo', 'APO'))).toBe('Apollo (APO)');
    expect(formatProjectLabel(project('echo', 'Echo'))).toBe('Echo');
  });

  it('records projects most-recent-first without duplicates', () => {
    recordRecentProject('apollo');
    recordRecentProject('beacon');
    recordRecentProject('apollo');
    recordRecentProject('  ');

    expect(getRecentProjectIds()).toEqual(['apollo', 'beacon']);
  });

  it('caps the recent list at 20 entries', () => {
    for (let i = 0; i < 25; i += 1) {
      recordRecentProject(`p${i}`);
    }

    const recent = getRecentProjectIds();
    expect(recent).toHaveLength(20);
    expect(recent[0]).toBe('p24');
    expect(recent).not.toContain('p4');
  });

  it('ignores malformed storage content', () => {
    localStorage.setItem('keel_ui:recentProjectIds', '{"nope":true}');
    expect(getRecentProjectIds()).toEqual([]);

    localStorage.setItem('keel_ui:recentProjectIds', 'not json');
    expect(getRecentProjectIds()).toEqual([]);
  });

  it('returns every project in the given order when there is no input', () => {
    expect(optionIds('')).toEqual(['apollo', 'beacon', 'cascade', 'delta', 'echo']);
  });

  it('filters by project name, case-insensitively', () => {
    expect(optionIds('CA')).toEqual(['cascade']);
  });

  it('filters by project key too', () => {
    expect(optionIds('dlt')).toEqual(['delta']);
  });

  it('pins recently used projects first', () => {
    recordRecentProject('cascade');
    recordRecentProject('echo');

    expect(optionIds('')).toEqual(['echo', 'cascade', 'apollo', 'beacon', 'delta']);
  });

  it('keeps the pinned order while filtering', () => {
    recordRecentProject('delta');
    recordRecentProject('echo');

    // 'a' matches Apollo / Beacon / Cascade / Delta; Echo drops out even though it is the
    // most recent, and Delta stays pinned to the front.
    expect(optionIds('a')).toEqual(['delta', 'apollo', 'beacon', 'cascade']);
  });

  it('honours the pinned count', () => {
    recordRecentProject('apollo');
    recordRecentProject('cascade');
    recordRecentProject('delta');
    recordRecentProject('echo');

    expect(optionIds('', 2)).toEqual(['echo', 'delta', 'apollo', 'beacon', 'cascade']);
  });

  it('truncates the displayed options', () => {
    expect(optionIds('', undefined, 2)).toEqual(['apollo', 'beacon']);
    expect(optionIds('a', undefined, 2)).toEqual(['apollo', 'beacon']);
  });

  it('sorts the unpinned projects by name, regardless of the given order', () => {
    const shuffled = [PROJECTS[3], PROJECTS[0], PROJECTS[4], PROJECTS[2], PROJECTS[1]];
    expect(optionIds('', undefined, undefined, shuffled)).toEqual([
      'apollo',
      'beacon',
      'cascade',
      'delta',
      'echo',
    ]);
  });

  it('sorts numerically so "Project 2" comes before "Project 10"', () => {
    const numbered = [
      project('p10', 'Project 10'),
      project('p2', 'Project 2'),
      project('p1', 'Project 1'),
    ];
    expect(optionIds('', undefined, undefined, numbered)).toEqual(['p1', 'p2', 'p10']);
  });

  it('keeps pinned recents ahead of the alphabetical rest', () => {
    recordRecentProject('echo');
    expect(optionIds('')).toEqual(['echo', 'apollo', 'beacon', 'cascade', 'delta']);
  });

  it('pins every stored recent by default so older recents stay at the front', () => {
    const withFoxtrot = [...PROJECTS, project('foxtrot', 'Foxtrot')];
    ['beacon', 'cascade', 'delta', 'echo', 'apollo'].forEach(recordRecentProject);

    expect(getRecentProjectIds()).toEqual(['apollo', 'echo', 'delta', 'cascade', 'beacon']);
    expect(DEFAULT_RECENT_PROJECTS_PINNED_COUNT).toBe(RECENT_PROJECTS_MAX_SIZE);
    // pin=4 would drop beacon into the alphabetical rest (after Foxtrot would still be last,
    // but beacon would sit next to it). All five recents stay ahead of Foxtrot.
    expect(optionIds('', undefined, undefined, withFoxtrot)).toEqual([
      'apollo',
      'echo',
      'delta',
      'cascade',
      'beacon',
      'foxtrot',
    ]);
  });

  it('pins recents up to the storage cap and leaves the rest alphabetical', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      project(`p${i}`, `Project ${String(i).padStart(2, '0')}`)
    );
    for (let i = 0; i < 25; i += 1) {
      recordRecentProject(`p${i}`);
    }

    const recent = getRecentProjectIds();
    expect(recent).toHaveLength(RECENT_PROJECTS_MAX_SIZE);
    expect(recent[0]).toBe('p24');

    const result = optionIds('', undefined, 50, many);
    expect(result.slice(0, RECENT_PROJECTS_MAX_SIZE)).toEqual(recent);
    expect(result.slice(RECENT_PROJECTS_MAX_SIZE)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('ignores unknown ids in the recent list', () => {
    recordRecentProject('gone');
    recordRecentProject('cascade');

    expect(optionIds('')).toEqual(['cascade', 'apollo', 'beacon', 'delta', 'echo']);
  });
});
