import type { ProjectManifest, ViewConfig } from '../../types';
import type { CoreRefs, CoreSetters } from './actionsTypes';
import { putManifestWith412Retries } from './putManifestWith412Retries';

/**
 * Persists a single view config change, re-applying `updater` to the server's latest
 * manifest on 412 (handles concurrent manifest writes).
 */
export async function putViewConfigManifestWith412Retries(args: {
  activeProjectId: string;
  viewId: string;
  updater: (view: ViewConfig) => ViewConfig;
  initialManifest: ProjectManifest;
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  setActiveProject: CoreSetters['setActiveProject'];
}): Promise<void> {
  const { activeProjectId, viewId, updater, initialManifest, manifestEtagRef, setActiveProject } = args;

  await putManifestWith412Retries({
    activeProjectId,
    initialManifest,
    manifestEtagRef,
    setActiveProject,
    rebuild: (latest) => {
      const index = latest.views.findIndex((v) => v.id === viewId);
      if (index === -1) {
        throw new Error(`view ${viewId} missing after manifest 412`);
      }
      const views = [...latest.views];
      views[index] = updater(latest.views[index]);
      return { ...latest, views };
    },
  });
}
