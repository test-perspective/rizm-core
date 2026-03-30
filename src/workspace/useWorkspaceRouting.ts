import { useEffect, useMemo } from 'react';
import type { Entity, ProjectManifest, ProjectMeta } from '../types';
import { getLastViewForProject, getLastWikiPageForProjectView, setLastViewForProject } from './storage';

type UseWorkspaceRoutingArgs = {
  loading: boolean;
  manifest: ProjectManifest | null;
  entities: Entity[];
  projects: ProjectMeta[];
  activeProjectId: string;
  setActiveProjectId: (projectId: string) => void;
  urlProjectId?: string;
  urlViewId?: string;
  urlEntityId?: string;
  locationPathname: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  pendingUrlProjectId: string | null;
  clearPendingUrlProjectId: () => void;
};

export const useWorkspaceRouting = ({
  loading,
  manifest,
  entities,
  projects,
  activeProjectId,
  setActiveProjectId,
  urlProjectId,
  urlViewId,
  urlEntityId,
  locationPathname,
  navigate,
  pendingUrlProjectId,
  clearPendingUrlProjectId,
}: UseWorkspaceRoutingArgs) => {
  const buildPath = (p: { projectId: string; viewId: string; entityId?: string | null }): string => {
    const project = encodeURIComponent(p.projectId);
    const view = encodeURIComponent(p.viewId);
    const base = `/p/${project}/v/${view}`;
    if (p.entityId) return `${base}/e/${encodeURIComponent(p.entityId)}`;
    return base;
  };

  const effectiveViewId = useMemo((): string | null => {
    if (!manifest) return null;
    if (urlViewId && manifest.views.some((v) => v.id === urlViewId)) return urlViewId;
    const saved = getLastViewForProject(activeProjectId);
    if (saved && manifest.views.some((v) => v.id === saved)) return saved;
    return manifest.defaultView;
  }, [manifest, urlViewId, activeProjectId]);

  const currentView = manifest
    ? manifest.views.find((v) => v.id === effectiveViewId) || manifest.views[0] || null
    : null;
  const currentEntity =
    manifest && currentView
      ? manifest.entities.find((e) => e.id === currentView.entityId) || manifest.entities[0] || null
      : null;
  const currentEntities = useMemo(
    () => (currentView ? entities.filter((e) => e.entityId === currentView.entityId) : []),
    [currentView, entities]
  );

  useEffect(() => {
    if (loading) return;

    if (urlProjectId && urlProjectId !== activeProjectId) {
      if (pendingUrlProjectId && activeProjectId === pendingUrlProjectId && urlProjectId !== pendingUrlProjectId) {
        return;
      }
      const urlProjectKnown = projects.some((p) => p.id === urlProjectId);
      if (!urlProjectKnown) {
        navigate(`/p/${encodeURIComponent(activeProjectId)}`, { replace: true });
        return;
      }
      setActiveProjectId(urlProjectId);
      return;
    }

    if (!manifest || !currentView) return;

    if (pendingUrlProjectId && urlProjectId === pendingUrlProjectId) {
      clearPendingUrlProjectId();
    }

    if (effectiveViewId && getLastViewForProject(activeProjectId) !== effectiveViewId) {
      setLastViewForProject(activeProjectId, effectiveViewId);
    }

    if (locationPathname === '/' && activeProjectId && effectiveViewId) {
      navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId }), { replace: true });
      return;
    }
    if (urlProjectId && !urlViewId && effectiveViewId) {
      navigate(buildPath({ projectId: urlProjectId, viewId: effectiveViewId }), { replace: true });
      return;
    }

    if (currentView.type === 'wiki' && effectiveViewId) {
      const pagesForView = entities.filter((e) => e.entityId === currentView.entityId);

      if (urlEntityId) {
        const exists = pagesForView.some((p) => p.id === urlEntityId);
        if (!exists) {
          navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId }), { replace: true });
        }
        return;
      }

      const saved = getLastWikiPageForProjectView(activeProjectId, effectiveViewId);
      const savedValid = saved && pagesForView.some((p) => p.id === saved);
      const fallback = savedValid ? saved! : (pagesForView[0]?.id ?? null);
      if (fallback) {
        navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: fallback }), {
          replace: true,
        });
      }
      return;
    }

    if (currentView.type !== 'wiki' && effectiveViewId && urlEntityId) {
      const exists = currentEntities.some((e) => e.id === urlEntityId);
      if (!exists) {
        navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId }), { replace: true });
      }
    }
  }, [
    loading,
    projects,
    urlProjectId,
    urlViewId,
    urlEntityId,
    activeProjectId,
    setActiveProjectId,
    manifest,
    currentView,
    currentEntities,
    entities,
    effectiveViewId,
    locationPathname,
    navigate,
    pendingUrlProjectId,
    clearPendingUrlProjectId,
  ]);

  const selectedWikiPageId = currentView?.type === 'wiki' ? (urlEntityId ?? null) : null;
  const selectedEntityFromUrl =
    currentView && currentView.type !== 'wiki' && urlEntityId
      ? (currentEntities.find((e) => e.id === urlEntityId) ?? null)
      : null;

  return {
    buildPath,
    effectiveViewId,
    currentView,
    currentEntity,
    currentEntities,
    selectedWikiPageId,
    selectedEntityFromUrl,
  };
};
