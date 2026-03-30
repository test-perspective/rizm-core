import type { Project } from '../../types';

type ApplyProjectStateArgs = {
  project: Project;
  manifestEtag: string;
  projectId: string;
  setActiveProject: (next: Project | null) => void;
  setActiveProjectId: (next: string) => void;
  manifestEtagRef: React.MutableRefObject<string>;
  entityEtagByIdRef: React.MutableRefObject<Record<string, string>>;
};

export function buildEntityEtags(project: Project): Record<string, string> {
  const etags: Record<string, string> = {};
  for (const e of project.entities ?? []) {
    etags[e.id] = `"${e.updatedAt}"`;
  }
  return etags;
}

export function applyProjectState({
  project,
  manifestEtag,
  projectId,
  setActiveProject,
  setActiveProjectId,
  manifestEtagRef,
  entityEtagByIdRef,
}: ApplyProjectStateArgs) {
  setActiveProject(project);
  setActiveProjectId(projectId);
  manifestEtagRef.current = manifestEtag || '0';
  entityEtagByIdRef.current = buildEntityEtags(project);
}

