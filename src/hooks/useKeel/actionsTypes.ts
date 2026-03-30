import type { Project, ProjectMeta } from '../../types';

export type SetState<T> = (next: T | ((prev: T) => T)) => void;
export type MutableRef<T> = { current: T };

export type CoreRefs = {
  entityEtagByIdRef: MutableRef<Record<string, string>>;
  manifestEtagRef: MutableRef<string>;
};

export type CoreSetters = {
  setActiveProject: SetState<Project | null>;
  setActiveProjectId: SetState<string>;
  setProjects: SetState<ProjectMeta[]>;
};
