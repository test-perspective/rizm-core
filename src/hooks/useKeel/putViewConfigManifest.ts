import { ApiError } from '../../auth/api';
import { putManifestApi } from '../../api/manifest';
import { fetchProjectState } from '../../api/projects';
import type { ProjectManifest, ViewConfig } from '../../types';
import type { CoreRefs, CoreSetters } from './actionsTypes';

const MAX_412_RETRIES = 8;

function normalizeManifestEtag(raw: string): string {
  return raw.trim().replace(/^"|"$/g, '').trim();
}

/**
 * Persists a single view config change, re-fetching manifest on 412 and re-applying
 * `updater` until success or retry budget is exhausted (handles concurrent manifest writes).
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
  let manifestToPut: ProjectManifest = initialManifest;

  for (let i = 0; i < MAX_412_RETRIES; i++) {
    try {
      const etagHeader = await putManifestApi(activeProjectId, manifestToPut, manifestEtagRef.current, {
        source: 'silent',
      });
      manifestEtagRef.current = normalizeManifestEtag(etagHeader);
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 412) {
        throw e;
      }
      const latest = await fetchProjectState(activeProjectId);
      manifestEtagRef.current = latest.manifestEtag || '0';
      const latestManifest = latest.project.config.manifest;
      const latestViewIndex = latestManifest.views.findIndex((v) => v.id === viewId);
      if (latestViewIndex === -1) {
        throw new Error(`view ${viewId} missing after manifest 412`);
      }
      const retriedView = updater(latestManifest.views[latestViewIndex]);
      const retriedViews = [...latestManifest.views];
      retriedViews[latestViewIndex] = retriedView;
      manifestToPut = { ...latestManifest, views: retriedViews };
      setActiveProject((p) => {
        if (!p) return p;
        return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest: manifestToPut } };
      });
    }
  }

  throw new ApiError(412, 'manifest view config: exhausted precondition retries');
}
