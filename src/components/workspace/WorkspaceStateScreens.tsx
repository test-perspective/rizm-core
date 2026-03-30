import type { ProjectManifest, ViewConfig } from '../../types';

type WorkspaceStateScreensProps = {
  loading: boolean;
  activeProject: { id: string; name: string } | null;
  manifest: ProjectManifest | null;
  currentView: ViewConfig | null;
  currentEntity: { id: string } | null;
  projectsCount: number;
};

export function WorkspaceStateScreens({
  loading,
  activeProject,
  manifest,
  currentView,
  currentEntity,
  projectsCount,
}: WorkspaceStateScreensProps) {
  if (loading) {
    return (
      <div className="flex min-h-full w-full flex-1 items-center justify-center bg-zinc-950">
        <div className="text-white">Loading Rizm...</div>
      </div>
    );
  }

  if (!activeProject || !manifest || !currentView || !currentEntity) {
    const hasProjects = projectsCount > 0;
    return (
      <div className="flex min-h-full w-full flex-1 items-center justify-center bg-zinc-950">
        <div className="text-center">
          {hasProjects ? (
            <>
              <div className="text-red-400 text-xl mb-2">Cannot access project</div>
              <div className="text-zinc-400 text-sm">
                Please check the project's permission settings.
                <br />
                Please contact an administrator.
              </div>
            </>
          ) : (
            <>
              <div className="text-zinc-400 text-xl mb-2">No accessible projects</div>
              <div className="text-zinc-400 text-sm">
                Please ask your administrator to grant you access to a project.
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
