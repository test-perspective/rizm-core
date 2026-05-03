import { putManifestApi, type PutManifestOptions } from '../../api/manifest';
import type { Entity, Project, ProjectManifest, ViewConfig } from '../../types';
import { reconcileManifestWithData } from '../../utils/manifestReconcile';
import { getDefaultManifest } from '../../utils/storage';
import type { CoreRefs, CoreSetters } from './actionsTypes';
import { enqueueManifestPut } from './manifestPutQueue';
import type { RefreshAfterConflict } from './modifyEntityPatchPump';
import { putViewConfigManifestWith412Retries } from './putViewConfigManifest';

export function updateSchemaAction(args: {
  activeProjectId: string;
  newManifest: ProjectManifest;
  options?: { removeEntityProperty?: { entityId: string; propName: string } };
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProjectId, newManifest, options, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const removal = options?.removeEntityProperty ?? null;
  setActiveProject((prev) => {
    if (!prev) return prev;
    let nextEntities: Entity[] = prev.entities ?? [];
    if (removal) {
      nextEntities = nextEntities.map((e) => {
        if (e.entityId !== removal.entityId) return e;
        if (!(removal.propName in e.properties)) return e;
        const next = { ...e.properties };
        delete next[removal.propName];
        return { ...e, updatedAt: Date.now(), properties: next };
      });
    }
    return {
      ...prev,
      entities: nextEntities,
      config: { ...prev.config, manifest: newManifest },
    };
  });

  enqueueManifestPut(activeProjectId, async () => {
    try {
      const next = await putManifestApi(activeProjectId, newManifest, manifestEtagRef.current, { source: 'silent' });
      manifestEtagRef.current = next.trim().replace(/^"|"$/g, '').trim();
    } catch (e) {
      console.error('Failed to save manifest:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}

export function updateManifestAction(args: {
  activeProject: Project | null;
  activeProjectId: string;
  newManifest: ProjectManifest;
  options?: PutManifestOptions;
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProject, activeProjectId, newManifest, options, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const reconciled = (() => {
    const p = activeProject;
    if (!p) return newManifest;
    const old = p.config.manifest;
    return reconcileManifestWithData(old, newManifest, p.entities ?? []).manifest;
  })();

  setActiveProject((p) => {
    if (!p) return p;
    const old = p.config.manifest;
    const { manifest } = reconcileManifestWithData(old, newManifest, p.entities ?? []);
    return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest } };
  });

  const putOptions: PutManifestOptions = options?.source ? options : { source: 'silent', ...options };
  enqueueManifestPut(activeProjectId, async () => {
    try {
      const next = await putManifestApi(activeProjectId, reconciled, manifestEtagRef.current, putOptions);
      manifestEtagRef.current = next.trim().replace(/^"|"$/g, '').trim();
    } catch (e) {
      console.error('Failed to save manifest:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}

export function transformManifestAction(args: {
  activeProjectManifest?: ProjectManifest;
  activeProjectId: string;
  transformation: Partial<ProjectManifest>;
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProjectManifest, activeProjectId, transformation, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const base = activeProjectManifest ?? getDefaultManifest();
  const nextManifest = { ...base, ...transformation };
  setActiveProject((p) => {
    if (!p) return p;
    return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest: nextManifest } };
  });
  enqueueManifestPut(activeProjectId, async () => {
    try {
      const next = await putManifestApi(activeProjectId, nextManifest, manifestEtagRef.current, { source: 'silent' });
      manifestEtagRef.current = next.trim().replace(/^"|"$/g, '').trim();
    } catch (e) {
      console.error('Failed to save manifest:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}

export function updateViewConfigAction(args: {
  activeProject: Project | null;
  activeProjectId: string;
  viewId: string;
  updater: (view: ViewConfig) => ViewConfig;
  setActiveProject: CoreSetters['setActiveProject'];
  manifestEtagRef: CoreRefs['manifestEtagRef'];
  refreshActiveProject: RefreshAfterConflict;
}) {
  const { activeProject, activeProjectId, viewId, updater, setActiveProject, manifestEtagRef, refreshActiveProject } = args;
  const currentManifest = activeProject?.config.manifest;
  if (!currentManifest) return;
  const viewIndex = currentManifest.views.findIndex((v) => v.id === viewId);
  if (viewIndex === -1) return;

  const updatedView = updater(currentManifest.views[viewIndex]);
  const nextViews = [...currentManifest.views];
  nextViews[viewIndex] = updatedView;
  const nextManifest: ProjectManifest = { ...currentManifest, views: nextViews };

  setActiveProject((p) => {
    if (!p) return p;
    return { ...p, updatedAt: Date.now(), config: { ...p.config, manifest: nextManifest } };
  });

  enqueueManifestPut(activeProjectId, async () => {
    try {
      await putViewConfigManifestWith412Retries({
        activeProjectId,
        viewId,
        updater,
        initialManifest: nextManifest,
        manifestEtagRef,
        setActiveProject,
      });
    } catch (e) {
      console.error('Failed to save view config:', e);
      await refreshActiveProject({ bypassProjectRefreshBlock: true });
    }
  });
}
