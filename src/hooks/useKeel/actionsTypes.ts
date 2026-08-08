import type { Entity, Project, ProjectMeta } from '../../types';

export type SetState<T> = (next: T | ((prev: T) => T)) => void;
export type MutableRef<T> = { current: T };

export type PendingCreatedEntity = {
  projectId: string;
  entity: Entity;
  status: 'creating' | 'confirmed';
  etag?: string;
  confirmedAt?: number;
};

export type CoreRefs = {
  entityEtagByIdRef: MutableRef<Record<string, string>>;
  manifestEtagRef: MutableRef<string>;
  pendingCreatedEntitiesRef: MutableRef<Map<string, PendingCreatedEntity>>;
};

export type CoreSetters = {
  setActiveProject: SetState<Project | null>;
  setActiveProjectId: SetState<string>;
  setProjects: SetState<ProjectMeta[]>;
};
