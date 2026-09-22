import { ApiError } from '../../auth/api';
import { putManifestApi } from '../../api/manifest';
import { fetchProjectState } from '../../api/projects';
import type { ProjectManifest } from '../../types';
import type { CoreRefs, CoreSetters } from './actionsTypes';

const MAX_412_RETRIES = 8;

export function normalizeManifestEtag(raw: string): string {
  return raw.trim().replace(/^"|"$/g, '').trim();
}

/**
 * Persists a manifest change, re-fetching on 412 and re-applying the caller's intent
 * to the server's latest manifest until it sticks.
 *
 * Every manifest write needs this: a stale ETag used to make the write fail silently
 * and the change get rolled back by the follow-up refresh (REQ-322).
 *
 * `rebuild` receives the manifest the server currently holds and must return the same
 * change applied to it. It has to be idempotent -- the change may already be there.
 */
export async function putManifestWith412Retries(args: {
  activeProjectId: string;
  initialManifest: ProjectManifest;
  rebuild: (latest: ProjectManifest) => ProjectManifest;
  source?: string;
  message?: string;
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  setActiveProject: CoreSetters['setActiveProject'];
}): Promise<void> {
  const {
    activeProjectId,
    initialManifest,
    rebuild,
    source = 'silent',
    message,
    manifestEtagRef,
    setActiveProject,
  } = args;
  let manifestToPut: ProjectManifest = initialManifest;

  for (let i = 0; i < MAX_412_RETRIES; i++) {
    try {
      const etagHeader = await putManifestApi(activeProjectId, manifestToPut, manifestEtagRef.current, {
        source,
        message,
      });
      manifestEtagRef.current = normalizeManifestEtag(etagHeader);
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 412) {
        throw e;
      }
      const latest = await fetchProjectState(activeProjectId);
      manifestEtagRef.current = latest.manifestEtag || '0';
      manifestToPut = rebuild(latest.project.config.manifest);
      setActiveProject((p) => {
        if (!p) return p;
        return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest: manifestToPut } };
      });
    }
  }

  throw new ApiError(412, 'manifest: exhausted precondition retries');
}
