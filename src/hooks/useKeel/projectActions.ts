import { deleteProjectApi, fetchProjectsIndex, fetchProjectState, saveProjectState } from '../../api/projects';
import type { Entity, Project, ProjectManifest, ProjectMeta } from '../../types';
import { ensureWikiInManifest, getDefaultManifest } from '../../utils/storage';
import { randomUUID } from '../../utils/uuid';
import { applyProjectState } from './projectState';
import type { CoreRefs, CoreSetters, SetState } from './actionsTypes';

export type ReloadResult = {
  activeProjectId: string;
  projects: ProjectMeta[];
};

export function createProjectAction(args: {
  input: { name: string; projectKey: string; manifest?: ProjectManifest; entities?: Entity[] };
  setPendingUrlProjectId: SetState<string | null>;
  setProjects: CoreSetters['setProjects'];
  setActiveProjectId: CoreSetters['setActiveProjectId'];
  setActiveProject: CoreSetters['setActiveProject'];
}) {
  const { input, setPendingUrlProjectId, setProjects, setActiveProjectId, setActiveProject } = args;
  const now = Date.now();
  const id = randomUUID();
  setPendingUrlProjectId(id);
  const baseManifest = input.manifest ?? getDefaultManifest();
  const manifest = ensureWikiInManifest({
    ...baseManifest,
    name: input.name.trim() || 'Development',
  });
  const project: Project = {
    id,
    name: input.name.trim() || 'Development',
    projectKey: input.projectKey.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
    entities: input.entities ?? [],
    config: { manifest },
  };
  setProjects((prev) => [{ id, name: project.name, projectKey: project.projectKey, createdAt: now, updatedAt: now }, ...prev]);
  setActiveProjectId(id);
  setActiveProject(project);
  saveProjectState(project)
    .then(async () => {
      const index = await fetchProjectsIndex();
      setProjects(index.projects);
    })
    .catch((e) => console.error('Failed to create project:', e));
  return project;
}

export async function reloadAction(args: {
  setProjects: CoreSetters['setProjects'];
  setActiveProject: CoreSetters['setActiveProject'];
  setActiveProjectId: CoreSetters['setActiveProjectId'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  entityEtagByIdRef: CoreRefs['entityEtagByIdRef'];
  pendingCreatedEntitiesRef: CoreRefs['pendingCreatedEntitiesRef'];
}): Promise<ReloadResult> {
  const {
    setProjects,
    setActiveProject,
    setActiveProjectId,
    manifestEtagRef,
    entityEtagByIdRef,
    pendingCreatedEntitiesRef,
  } = args;
  const index = await fetchProjectsIndex();
  setProjects(index.projects);
  setActiveProjectId(index.activeProjectId);
  const { project, manifestEtag } = await fetchProjectState(index.activeProjectId);
  applyProjectState({
    project,
    manifestEtag,
    projectId: index.activeProjectId,
    setActiveProject,
    setActiveProjectId,
    manifestEtagRef,
    entityEtagByIdRef,
    pendingCreatedEntitiesRef,
  });
  return { activeProjectId: index.activeProjectId, projects: index.projects };
}

export async function renameProjectAction(args: {
  activeProject: Project | null;
  activeProjectId: string;
  name: string;
  setActiveProject: CoreSetters['setActiveProject'];
  setProjects: CoreSetters['setProjects'];
  reload: () => Promise<ReloadResult>;
}) {
  const { activeProject, activeProjectId, name, setActiveProject, setProjects, reload } = args;
  if (!activeProject) return;
  const trimmedName = name.trim();
  const updatedProject: Project = {
    ...activeProject,
    name: trimmedName,
    updatedAt: Date.now(),
    config: {
      ...activeProject.config,
      manifest: {
        ...activeProject.config.manifest,
        name: trimmedName,
      },
    },
  };
  await saveProjectState(updatedProject);
  setActiveProject(updatedProject);
  setProjects((prev) =>
    prev.map((p) => (p.id === activeProjectId ? { ...p, name: trimmedName, updatedAt: updatedProject.updatedAt } : p))
  );
  await reload();
}

export async function deleteProjectAction(args: {
  activeProjectId: string;
  projects: ProjectMeta[];
  projectId: string;
  setProjects: CoreSetters['setProjects'];
  setActiveProjectId: CoreSetters['setActiveProjectId'];
  setActiveProject: CoreSetters['setActiveProject'];
  reload: () => Promise<ReloadResult>;
}): Promise<{ wasActive: boolean } & ReloadResult> {
  const { activeProjectId, projects, projectId, setProjects, setActiveProjectId, setActiveProject, reload } = args;
  const wasActive = activeProjectId === projectId;
  await deleteProjectApi(projectId);
  setProjects((prev) => prev.filter((p) => p.id !== projectId));
  if (wasActive) {
    const remaining = projects.filter((p) => p.id !== projectId);
    if (remaining.length > 0) {
      setActiveProjectId(remaining[0].id);
    } else {
      setActiveProjectId('default');
      setActiveProject(null);
    }
  }
  const reloadResult = await reload();
  return { wasActive, ...reloadResult };
}
