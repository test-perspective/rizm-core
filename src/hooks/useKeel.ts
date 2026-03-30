import { useState, useEffect, useCallback, useRef } from 'react';
import { Entity, Project, ProjectManifest, ProjectMeta, ViewConfig } from '../types';
import { fetchProjectState, fetchProjectsIndex } from '../api/projects';
import { type PutManifestOptions } from '../api/manifest';
import { applyProjectState } from './useKeel/projectState';
import {
  addEntityAction,
  applyServerEntityAction,
  createProjectAction,
  deleteProjectAction,
  modifyEntityAction,
  reloadAction,
  removeEntityAction,
  renameProjectAction,
  transformManifestAction,
  updateManifestAction,
  updateSchemaAction,
  updateViewConfigAction,
} from './useKeel/actions';

export type RefreshActiveProjectOptions = {
  bypassProjectRefreshBlock?: boolean;
};

export const useKeel = () => {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('default');
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingUrlProjectId, setPendingUrlProjectId] = useState<string | null>(null);
  const activeProjectIdRef = useRef(activeProjectId);
  const loadTokenRef = useRef(0);
  const entityEtagByIdRef = useRef<Record<string, string>>({});
  const manifestEtagRef = useRef<string>('0');
  const projectRefreshBlockedRef = useRef(false);

  const setProjectRefreshBlocked = useCallback((blocked: boolean) => {
    projectRefreshBlockedRef.current = blocked;
  }, []);

  const entities = activeProject?.entities ?? [];
  const manifest = activeProject?.config.manifest ?? null;

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    const loadToken = ++loadTokenRef.current;
    (async () => {
      try {
        const index = await fetchProjectsIndex();
        if (cancelled) return;
        setProjects(index.projects);
        setActiveProjectId(index.activeProjectId);

        // Try to load the active project, but if it fails, try the first accessible project
        let projectLoaded = false;
        for (const projectId of [index.activeProjectId, ...index.projects.map((p) => p.id)]) {
          try {
            const { project, manifestEtag } = await fetchProjectState(projectId);
            if (cancelled) return;
            if (loadTokenRef.current !== loadToken) return;
            applyProjectState({
              project,
              manifestEtag,
              projectId,
              setActiveProject,
              setActiveProjectId,
              manifestEtagRef,
              entityEtagByIdRef,
            });
            projectLoaded = true;
            break;
          } catch (e) {
            // Continue to next project
            console.warn(`Failed to load project ${projectId}:`, e);
          }
        }

        if (!projectLoaded && !cancelled) {
          // No accessible projects found
          console.warn('No accessible projects found');
          setProjects(index.projects);
          setActiveProjectId(index.activeProjectId);
          setActiveProject(null);
            entityEtagByIdRef.current = {};
            manifestEtagRef.current = '0';
        }
      } catch (e) {
        console.error('Failed to load data:', e);
        if (!cancelled) {
          setProjects([]);
          setActiveProjectId('default');
          setActiveProject(null);
          entityEtagByIdRef.current = {};
          manifestEtagRef.current = '0';
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!activeProjectId) return;
    if (activeProject?.id === activeProjectId) return;

    let cancelled = false;
    const loadToken = ++loadTokenRef.current;
    const requestedProjectId = activeProjectId;
    (async () => {
      try {
        const { project, manifestEtag } = await fetchProjectState(activeProjectId);
        if (cancelled) return;
        if (loadTokenRef.current !== loadToken) return;
        if (activeProjectIdRef.current !== requestedProjectId) return;
        applyProjectState({
          project,
          manifestEtag,
          projectId: activeProjectId,
          setActiveProject,
          setActiveProjectId,
          manifestEtagRef,
          entityEtagByIdRef,
        });
      } catch (e) {
        if (activeProjectIdRef.current !== requestedProjectId) return;
        console.error('Failed to load project:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id, activeProjectId, loading]);

  const refreshActiveProject = useCallback(async (options?: RefreshActiveProjectOptions): Promise<Project | null> => {
    if (projectRefreshBlockedRef.current && !options?.bypassProjectRefreshBlock) {
      return null;
    }
    if (!activeProjectId) return null;
    const requestedProjectId = activeProjectId;
    try {
      const { project, manifestEtag } = await fetchProjectState(activeProjectId);
      if (activeProjectIdRef.current !== requestedProjectId) return null;
      applyProjectState({
        project,
        manifestEtag,
        projectId: activeProjectId,
        setActiveProject,
        setActiveProjectId,
        manifestEtagRef,
        entityEtagByIdRef,
      });
      return project;
    } catch (e) {
      if (activeProjectIdRef.current !== requestedProjectId) return null;
      console.error('Failed to refresh project:', e);
      // If permission denied, clear the project to prevent infinite retries
      if (e instanceof Error && (e.message.includes('insufficient permissions') || e.message.includes('403'))) {
        setActiveProject(null);
      }
      throw e;
    }
  }, [activeProjectId]);

  const addEntity = useCallback((entityId: string, properties: Record<string, unknown>) => {
    return addEntityAction({
      activeProjectId,
      entityId,
      properties,
      setActiveProject,
      entityEtagByIdRef,
    });
  }, [activeProjectId]);

  const modifyEntity = useCallback((id: string, properties: Record<string, unknown>) => {
    return modifyEntityAction({
      activeProjectId,
      id,
      properties,
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });
  }, [activeProjectId, refreshActiveProject]);

  const removeEntity = useCallback((id: string) => {
    removeEntityAction({
      activeProjectId,
      id,
      setActiveProject,
      entityEtagByIdRef,
      refreshActiveProject,
    });
  }, [activeProjectId, refreshActiveProject]);

  const updateSchema = useCallback((
    newManifest: ProjectManifest,
    options?: {
      removeEntityProperty?: { entityId: string; propName: string };
    }
  ) => {
    updateSchemaAction({
      activeProjectId,
      newManifest,
      options,
      setActiveProject,
      manifestEtagRef,
      refreshActiveProject,
    });
  }, [activeProjectId, refreshActiveProject]);

  const updateManifest = useCallback((newManifest: ProjectManifest, options?: PutManifestOptions) => {
    updateManifestAction({
      activeProject,
      activeProjectId,
      newManifest,
      options,
      setActiveProject,
      manifestEtagRef,
      refreshActiveProject,
    });
  }, [activeProject, activeProjectId, refreshActiveProject]);

  const transformManifest = useCallback((transformation: Partial<ProjectManifest>) => {
    transformManifestAction({
      activeProjectManifest: activeProject?.config.manifest,
      activeProjectId,
      transformation,
      setActiveProject,
      manifestEtagRef,
      refreshActiveProject,
    });
  }, [activeProjectId, activeProject?.config.manifest, refreshActiveProject]);

  const createProject = useCallback((input: {
    name: string;
    projectKey: string;
    manifest?: ProjectManifest;
    entities?: Entity[];
  }) => {
    return createProjectAction({
      input,
      setPendingUrlProjectId,
      setProjects,
      setActiveProjectId,
      setActiveProject,
    });
  }, []);

  const reload = useCallback(async () => {
    return await reloadAction({
      setProjects,
      setActiveProject,
      setActiveProjectId,
      manifestEtagRef,
      entityEtagByIdRef,
    });
  }, []);

  const updateViewConfig = useCallback((viewId: string, updater: (view: ViewConfig) => ViewConfig) => {
    updateViewConfigAction({
      activeProject,
      activeProjectId,
      viewId,
      updater,
      setActiveProject,
      manifestEtagRef,
      refreshActiveProject,
    });
  }, [activeProject, activeProjectId, refreshActiveProject]);

  const applyServerEntity = useCallback((entity: Entity, etag: string) => {
    applyServerEntityAction({
      entity,
      etag,
      setActiveProject,
      entityEtagByIdRef,
    });
  }, []);

  const renameProject = useCallback(async (name: string) => {
    await renameProjectAction({
      activeProject,
      activeProjectId,
      name,
      setActiveProject,
      setProjects,
      reload,
    });
  }, [activeProject, activeProjectId, reload]);

  const deleteProject = useCallback(
    async (projectId: string) => {
      return await deleteProjectAction({
        activeProjectId,
        projects,
        projectId,
        setProjects,
        setActiveProjectId,
        setActiveProject,
        reload,
      });
    },
    [activeProjectId, projects, reload]
  );

  return {
    projects,
    activeProjectId,
    setActiveProjectId,
    pendingUrlProjectId,
    clearPendingUrlProjectId: () => setPendingUrlProjectId(null),
    activeProject,
    entities,
    manifest,
    loading,
    addEntity,
    modifyEntity,
    removeEntity,
    updateSchema,
    updateManifest,
    transformManifest,
    createProject,
    reload,
    refreshActiveProject,
    setProjectRefreshBlocked,
    updateViewConfig,
    applyServerEntity,
    renameProject,
    deleteProject,
  };
};
