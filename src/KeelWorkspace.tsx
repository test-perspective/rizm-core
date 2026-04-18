import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useKeel } from './hooks/useKeel';
import { Sidebar, type SidebarHandle } from './components/Sidebar';
import { Entity, ViewConfig, type ProjectManifest } from './types';
import { reorderViews } from './utils/manifestMutations';
import { useAppDialog } from './components/dialogs';
import {
  setLastViewForProject,
  setLastWikiPageForProjectView,
  consumeReturnToProjectDetailsAfterScmOAuth,
} from './workspace/storage';
import { useResolvedUsers } from './workspace/useResolvedUsers';
import { useWorkspaceRouting } from './workspace/useWorkspaceRouting';
import { useCreateEntityHandler } from './workspace/useCreateEntityHandler';
import { resolveViewIdForSearchKind } from './workspace/searchRouting';
import { useWorkspaceManifestHandlers } from './workspace/useWorkspaceManifestHandlers';
import { WorkspaceHeader } from './components/workspace/WorkspaceHeader';
import {
  WorkspaceViewPanel,
  type WorkspaceNotesPaneConfig,
} from './components/workspace/WorkspaceViewPanel';
import { NotePanePagePickerDialog } from './components/workspace/NotePanePagePickerDialog';
import type { ViewTitleNotesMenu } from './components/BoardViewMenu';
import { WorkspaceStateScreens } from './components/workspace/WorkspaceStateScreens';
import { WorkspaceOverlays } from './components/workspace/WorkspaceOverlays';
import { useCreateProjectHandler } from './workspace/useCreateProjectHandler';
import { fetchProjectState } from './api/projects';
import type { SearchResult } from './api/search';
import { prepareSelectOptionRenameInManifest, finalizeSelectOptionRenameInManifest } from './utils/renameSelectOption';
import { waitForManifestPutQueueDrain } from './hooks/useKeel/manifestPutQueue';
import type { NotePanePrefs } from './workspace/notePaneStorage';
import {
  getNotePanePrefs,
  setNotePanePrefs,
  getDefaultNotePaneWidthPx,
  notePaneWidthBounds,
} from './workspace/notePaneStorage';

export function KeelWorkspace() {
  const dialog = useAppDialog();
  const { projectId: urlProjectId, viewId: urlViewId, entityId: urlEntityId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    activeProject,
    entities,
    manifest,
    loading,
    addEntity,
    modifyEntity,
    removeEntity,
    updateSchema,
    updateManifest,
    createProject,
    pendingUrlProjectId,
    clearPendingUrlProjectId,
    reload,
    refreshActiveProject,
    setProjectRefreshBlocked,
    updateViewConfig,
    applyServerEntity,
    renameProject,
    deleteProject,
  } = useKeel();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiCommandOpen, setAICommandOpen] = useState(false);
  // Entity detail opened from wiki (task-key links) should NOT overwrite wiki URL selection.
  const [overlayEntity, setOverlayEntity] = useState<Entity | null>(null);
  const [boardConfigOpen, setBoardConfigOpen] = useState(false);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [projectDetailDialogOpen, setProjectDetailDialogOpen] = useState(false);
  const [boardColumnRenameBusy, setBoardColumnRenameBusy] = useState(false);
  /** Entity ids in table current page or board lane — for detail panel ArrowLeft/ArrowRight. */
  const [detailNavEntityIds, setDetailNavEntityIds] = useState<string[]>([]);
  const wikiCreateRef = useRef<(() => void) | null>(null);
  const sidebarRef = useRef<SidebarHandle>(null);
  const [notePanePickerOpen, setNotePanePickerOpen] = useState(false);
  const [notePanePickerTargetViewId, setNotePanePickerTargetViewId] = useState<string | null>(null);
  const [notePaneLocal, setNotePaneLocal] = useState<NotePanePrefs>(() => ({
    open: false,
    pageId: null,
    widthPx: getDefaultNotePaneWidthPx(),
  }));

  useEffect(() => {
    if (consumeReturnToProjectDetailsAfterScmOAuth()) {
      setProjectDetailDialogOpen(true);
    }
  }, []);

  const {
    handleCreateProject,
    handleProjectReload,
    progressOpen,
    progressEvents,
    progressRunning,
    progressTitle,
    handleProgressCancel,
    handleProgressClose,
  } = useCreateProjectHandler({ createProject, reload, navigate });

  const { usersById, resolveUsers } = useResolvedUsers(entities);

  // Update browser tab title: "Rizm - {projectName}"
  useEffect(() => {
    const projectName = activeProject?.name;
    if (projectName) {
      document.title = `Rizm - ${projectName}`;
    } else {
      document.title = 'Rizm';
    }
  }, [activeProject?.name]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    buildPath,
    effectiveViewId,
    currentView,
    currentEntity,
    currentEntities,
    selectedWikiPageId,
    selectedEntityFromUrl,
  } = useWorkspaceRouting({
    loading,
    manifest,
    entities,
    projects,
    activeProjectId,
    setActiveProjectId,
    urlProjectId,
    urlViewId,
    urlEntityId,
    locationPathname: location.pathname,
    navigate,
    pendingUrlProjectId,
    clearPendingUrlProjectId,
  });

  const wikiViewConfig = useMemo(() => {
    if (!manifest) return null;
    const v = manifest.views.find((x) => x.type === 'wiki');
    return v ? { viewId: v.id, entityId: v.entityId } : null;
  }, [manifest]);

  const wikiPagesForNotes = useMemo(() => {
    if (!wikiViewConfig) return [];
    return entities.filter((e) => e.entityId === wikiViewConfig.entityId);
  }, [entities, wikiViewConfig]);

  // Only clear when leaving table/board. Do not depend on effectiveViewId — switching board→table
  // changes view id; clearing on every view id change can run after the table repopulates and wipe ids.
  useEffect(() => {
    const t = currentView?.type;
    if (t === 'table' || t === 'board') return;
    setDetailNavEntityIds([]);
  }, [currentView?.type]);

  useEffect(() => {
    if (overlayEntity) setDetailNavEntityIds([]);
  }, [overlayEntity]);

  const handleDetailNavEntityOrderChange = useCallback((ids: string[]) => {
    setDetailNavEntityIds((prev) => {
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
      return ids;
    });
  }, []);

  useEffect(() => {
    if (!activeProjectId || !effectiveViewId || !currentView) return;
    if (currentView.type !== 'board' && currentView.type !== 'table') return;
    setNotePaneLocal(getNotePanePrefs(activeProjectId, effectiveViewId));
  }, [activeProjectId, effectiveViewId, currentView?.type, currentView?.id]);

  useEffect(() => {
    if (!activeProjectId || !effectiveViewId || !currentView) return;
    if (currentView.type !== 'board' && currentView.type !== 'table') return;
    setNotePaneLocal((prev) => {
      if (!prev.open || !prev.pageId) return prev;
      if (wikiPagesForNotes.some((p) => p.id === prev.pageId)) return prev;
      const next: NotePanePrefs = {
        ...prev,
        pageId: wikiPagesForNotes[0]?.id ?? null,
      };
      setNotePanePrefs(activeProjectId, effectiveViewId, next);
      return next;
    });
  }, [activeProjectId, effectiveViewId, currentView?.type, currentView?.id, wikiPagesForNotes]);

  const persistNotePaneForView = useCallback(
    (viewId: string, next: NotePanePrefs) => {
      setNotePanePrefs(activeProjectId, viewId, next);
      if (viewId === effectiveViewId) {
        setNotePaneLocal(next);
      }
    },
    [activeProjectId, effectiveViewId]
  );

  const hideNotePaneForView = useCallback(
    (viewId: string) => {
      const prev = getNotePanePrefs(activeProjectId, viewId);
      persistNotePaneForView(viewId, { ...prev, open: false });
    },
    [activeProjectId, persistNotePaneForView]
  );

  const openNotePanePickerForView = useCallback((viewId: string) => {
    setNotePanePickerTargetViewId(viewId);
    setNotePanePickerOpen(true);
  }, []);

  const handleNotePanePickerConfirm = useCallback(
    (pageId: string, targetViewId: string) => {
      const prev = getNotePanePrefs(activeProjectId, targetViewId);
      const widthPx =
        prev.widthPx >= notePaneWidthBounds.min ? prev.widthPx : getDefaultNotePaneWidthPx();
      const next: NotePanePrefs = { open: true, pageId, widthPx };
      setNotePanePrefs(activeProjectId, targetViewId, next);
      setNotePanePickerOpen(false);
      setNotePanePickerTargetViewId(null);
      if (targetViewId !== effectiveViewId) {
        setLastViewForProject(activeProjectId, targetViewId);
        navigate(buildPath({ projectId: activeProjectId, viewId: targetViewId }), { replace: false });
      } else {
        setNotePaneLocal(next);
      }
    },
    [activeProjectId, navigate, buildPath, effectiveViewId]
  );

  const handleNotesWikiDelete = useCallback(
    (id: string) => {
      if (!wikiViewConfig) return;
      const pages = entities.filter((e) => e.entityId === wikiViewConfig.entityId);
      const collectDescendants = (parentId: string): string[] =>
        pages
          .filter((e) => e.properties?.parentId === parentId)
          .flatMap((e) => [e.id, ...collectDescendants(e.id)]);
      const toDelete = [id, ...collectDescendants(id)];
      toDelete.forEach((entityId) => removeEntity(entityId));
      const remaining = pages.filter((e) => !toDelete.includes(e.id));
      if (!effectiveViewId) return;
      setNotePaneLocal((prev) => {
        if (!prev.open || !prev.pageId || !toDelete.includes(prev.pageId)) return prev;
        const next: NotePanePrefs = {
          ...prev,
          pageId: remaining[0]?.id ?? null,
        };
        setNotePanePrefs(activeProjectId, effectiveViewId, next);
        return next;
      });
    },
    [wikiViewConfig, entities, removeEntity, activeProjectId, effectiveViewId]
  );

  const searchQueryFromLocation =
    (location.state as { searchQuery?: string } | null)?.searchQuery ?? undefined;

  const activeProjectKey =
    activeProject?.projectKey?.trim() || projects.find((p) => p.id === activeProjectId)?.projectKey?.trim() || activeProjectId;
  const projectKeyById = new Map(projects.map((p) => [p.id, p.projectKey ?? p.id]));

  // Always refresh on view change to reflect other users' updates.
  useEffect(() => {
    if (loading) return;
    if (!activeProjectId) return;
    refreshActiveProject().catch((e) => {
      console.error('Failed to refresh project:', e);
      // Don't spam retries if permission denied
      if (e instanceof Error && e.message.includes('insufficient permissions')) {
        console.warn('Permission denied for project, skipping refresh');
      }
    });
  }, [effectiveViewId, loading, activeProjectId, refreshActiveProject]);

  useEffect(() => {
    if (loading) return;
    if (!activeProjectId) return;
    if (currentView?.type !== 'board') return;
    const timer = setInterval(() => {
      refreshActiveProject().catch((e) => console.error('Failed to refresh project:', e));
    }, 10000);
    return () => clearInterval(timer);
  }, [activeProjectId, currentView?.type, loading, refreshActiveProject]);

  const { handleCreateEntity } = useCreateEntityHandler({
    currentView,
    currentEntity,
    currentEntities,
    activeProjectId,
    effectiveViewId: effectiveViewId ?? undefined,
    buildPath,
    navigate,
    addEntity,
  });

  const {
    handleAddPropertyDefinition,
    handleRemovePropertyDefinition,
    handleReorderProperties,
    handleUpsertPropertyOption,
  } = useWorkspaceManifestHandlers({
    manifest,
    currentEntityId: currentEntity?.id ?? '',
    currentViewId: currentView?.id ?? '',
    updateSchema,
    updateManifest,
    dialog,
  });

  const handleRenameBoardColumn = useCallback(
    async (from: string, to: string) => {
      if (!manifest || !currentView || currentView.type !== 'board' || !currentView.groupBy) return;
      const entityTypeId = currentView.entityId;
      const propName = currentView.groupBy;
      const fromT = from.trim();
      const toT = to.trim();
      if (!fromT || !toT || fromT === toT) return;

      setProjectRefreshBlocked(true);
      let prepared: ProjectManifest;
      try {
        try {
          prepared = prepareSelectOptionRenameInManifest(manifest, entityTypeId, propName, fromT, toT);
        } catch (e) {
          console.error('Board column rename (prepare):', e);
          await dialog.alert({
            title: 'Cannot rename column',
            message: e instanceof Error ? e.message : 'Unknown error',
          });
          return;
        }

        setBoardColumnRenameBusy(true);
        updateSchema(prepared);
        await waitForManifestPutQueueDrain(activeProjectId);

        const idsToMigrate = entities
          .filter((e) => e.entityId === entityTypeId && e.properties?.[propName] === fromT)
          .map((e) => e.id);

        for (const id of idsToMigrate) {
          const ok = await modifyEntity(id, { [propName]: toT });
          if (!ok) {
            console.error('Board column rename: entity migration failed', id);
            await dialog.alert({
              title: 'Rename incomplete',
              message: 'Some tasks could not be updated. Try again after refresh.',
            });
            return;
          }
        }

        // Entity PATCH can advance the server's manifest ETag even when manifest JSON is unchanged.
        // Finalize PUT must use the current ETag and a manifest derived from the latest server state.
        const syncedProject = await refreshActiveProject({ bypassProjectRefreshBlock: true });
        if (!syncedProject) {
          await dialog.alert({
            title: 'Rename failed',
            message: 'Could not sync project before finalizing the column rename.',
          });
          return;
        }

        const finalized = finalizeSelectOptionRenameInManifest(
          syncedProject.config.manifest,
          entityTypeId,
          propName,
          fromT,
          toT
        );
        updateSchema(finalized);
        await waitForManifestPutQueueDrain(activeProjectId);
      } catch (e) {
        console.error('Board column rename:', e);
        await dialog.alert({
          title: 'Rename failed',
          message: e instanceof Error ? e.message : 'Unknown error',
        });
      } finally {
        setProjectRefreshBlocked(false);
        await refreshActiveProject({ bypassProjectRefreshBlock: true }).catch((e) =>
          console.error('Failed to refresh project after column rename:', e)
        );
        setBoardColumnRenameBusy(false);
      }
    },
    [
      manifest,
      currentView,
      entities,
      activeProjectId,
      updateSchema,
      modifyEntity,
      setProjectRefreshBlocked,
      refreshActiveProject,
      dialog,
    ]
  );

  if (loading || !activeProject || !manifest || !currentView || !currentEntity) {
    return (
      <WorkspaceStateScreens
        loading={loading}
        activeProject={activeProject}
        manifest={manifest}
        currentView={currentView}
        currentEntity={currentEntity}
        projectsCount={projects.length}
      />
    );
  }

  const scmIntegrationEnabled = manifest.entities.some((e) => e.id === 'scmIntegration');

  const notesOccludeSidebar =
    notePaneLocal.open && (currentView.type === 'board' || currentView.type === 'table');

  const viewTitleNotesMenu: ViewTitleNotesMenu | undefined =
    wikiViewConfig && (currentView.type === 'board' || currentView.type === 'table')
      ? {
          show: true,
          wikiPagesCount: wikiPagesForNotes.length,
          isNotePaneOpen: notePaneLocal.open,
          onOpenPicker: () => {
            if (effectiveViewId) openNotePanePickerForView(effectiveViewId);
          },
          onHide: () => {
            if (effectiveViewId) hideNotePaneForView(effectiveViewId);
          },
        }
      : undefined;

  const notesPaneForPanel: WorkspaceNotesPaneConfig | null =
    wikiViewConfig &&
    effectiveViewId &&
    (currentView.type === 'board' || currentView.type === 'table') &&
    notePaneLocal.open
      ? (() => {
          const ev = effectiveViewId;
          return {
            wikiViewId: wikiViewConfig.viewId,
            wikiPages: wikiPagesForNotes,
            pageId: notePaneLocal.pageId,
            widthPx: notePaneLocal.widthPx,
            onPageIdChange: (id: string) => {
              setNotePaneLocal((prev) => {
                const next = { ...prev, pageId: id };
                setNotePanePrefs(activeProjectId, ev, next);
                return next;
              });
            },
            onClose: () => {
              hideNotePaneForView(ev);
            },
            onWidthChangeEnd: (w: number) => {
              setNotePaneLocal((prev) => {
                const next = { ...prev, widthPx: w };
                setNotePanePrefs(activeProjectId, ev, next);
                return next;
              });
            },
            onWikiCreate: (opts) => {
              const props: Record<string, unknown> = { title: '', doc: '' };
              if (opts?.parentId !== undefined) props.parentId = opts.parentId;
              if (opts?.nodeType) props.nodeType = opts.nodeType;
              return addEntity(wikiViewConfig.entityId, props);
            },
            onWikiDelete: handleNotesWikiDelete,
            onWikiUpdate: modifyEntity,
            onWikiEntityClick: (e) => setOverlayEntity(e),
            onRefreshProject: refreshActiveProject,
            onServerEntity: applyServerEntity,
            searchQuery: searchQueryFromLocation,
          };
        })()
      : null;

  const headerNotesChrome =
    notesOccludeSidebar && effectiveViewId
      ? {
          projects,
          activeProjectId,
          onProjectChange: (projectId: string) => {
            setOverlayEntity(null);
            navigate(`/p/${encodeURIComponent(projectId)}`, { replace: false });
          },
          visibleViews: manifest.views.filter((v) => v.type !== 'list'),
          currentViewId: effectiveViewId,
          onViewChange: (viewId: string) => {
            setLastViewForProject(activeProjectId, viewId);
            setOverlayEntity(null);
            navigate(buildPath({ projectId: activeProjectId, viewId }), { replace: false });
          },
          onOpenProjectDetail: () => setProjectDetailDialogOpen(true),
          onAddProject: () => sidebarRef.current?.openNewProject(),
        }
      : null;

  const handleNavigateEntity = (entityId: string) => {
    if (effectiveViewId) {
      navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId }), { replace: false });
    }
  };

  const handleSearchResultSelect = async (result: SearchResult, query: string) => {
    let targetManifest = manifest;
    if (!targetManifest || result.projectId !== activeProjectId) {
      try {
        const { project } = await fetchProjectState(result.projectId);
        targetManifest = project.config.manifest;
      } catch (e) {
        console.error('Failed to load project for search result:', e);
        return;
      }
    }
    if (!targetManifest) return;
    const viewId = resolveViewIdForSearchKind(targetManifest, result.kind);
    if (!viewId) return;
    if (result.kind === 'page') {
      setLastWikiPageForProjectView(result.projectId, viewId, result.entityPk);
      navigate(buildPath({ projectId: result.projectId, viewId, entityId: result.entityPk }), {
        replace: false,
        state: { searchQuery: query },
      });
      return;
    }
    navigate(buildPath({ projectId: result.projectId, viewId, entityId: result.entityPk }), { replace: false });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 bg-zinc-950 text-white overflow-hidden">
      <Sidebar
        ref={sidebarRef}
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectChange={(projectId) => {
          // URL is source of truth: navigate, then canonicalization effect will load the project and resolve view.
          setOverlayEntity(null);
          navigate(`/p/${encodeURIComponent(projectId)}`, { replace: false });
        }}
        onCreateProject={handleCreateProject}
        manifest={manifest}
        currentView={effectiveViewId ?? currentView?.id ?? ''}
        onViewChange={(viewId) => {
          setLastViewForProject(activeProjectId, viewId);
          setOverlayEntity(null);
          navigate(buildPath({ projectId: activeProjectId, viewId }), { replace: false });
        }}
        onOpenProjectDetail={() => setProjectDetailDialogOpen(true)}
        onReorderViews={(orderedViewIds) => {
          if (!manifest) return;
          try {
            const next = reorderViews(manifest, orderedViewIds);
            updateManifest(next);
          } catch (e) {
            // Invalid reorder input: log only; do not break the UI
            console.error('Failed to reorder views:', e);
          }
        }}
        notesPaneOccluding={notesOccludeSidebar}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <WorkspaceHeader
          currentView={currentView}
          currentEntity={currentEntity}
          currentEntities={currentEntities}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onCreateEntity={
            currentView.type === 'wiki'
              ? () => wikiCreateRef.current?.()
              : handleCreateEntity
          }
          onOpenBoardConfig={() => setBoardConfigOpen(true)}
          viewTitleNotes={viewTitleNotesMenu}
          notesChrome={headerNotesChrome}
        />

        <WorkspaceViewPanel
          currentView={currentView}
          currentEntity={currentEntity}
          currentEntities={currentEntities}
          entities={entities}
          projects={projects}
          activeProjectId={activeProjectId}
          activeProjectKey={activeProjectKey}
          scmIntegrationEnabled={scmIntegrationEnabled}
          effectiveViewId={effectiveViewId ?? undefined}
          selectedWikiPageId={selectedWikiPageId}
          detailUrlEntityId={urlEntityId ?? null}
          onDetailNavEntityOrderChange={handleDetailNavEntityOrderChange}
          usersById={usersById}
          onResolveUsers={resolveUsers}
          onNavigateEntity={handleNavigateEntity}
          onEntityUpdate={modifyEntity}
          onUpsertPropertyOption={handleUpsertPropertyOption}
          onViewConfigUpdate={(updatedView: ViewConfig) => {
            updateViewConfig(currentView.id, () => updatedView);
          }}
          onRefreshProject={refreshActiveProject}
          onRenameBoardColumn={handleRenameBoardColumn}
          boardColumnRenameBusy={boardColumnRenameBusy}
          onWikiSelect={(id) => {
            if (effectiveViewId) {
              setLastWikiPageForProjectView(activeProjectId, effectiveViewId, id);
              navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: id }), { replace: false });
            }
          }}
          onWikiCreate={(opts) => {
            const props: Record<string, unknown> = { title: '', doc: '' };
            if (opts?.parentId !== undefined) props.parentId = opts.parentId;
            if (opts?.nodeType) props.nodeType = opts.nodeType;
            return addEntity(currentView.entityId, props);
          }}
          onWikiDelete={(id) => {
            const collectDescendants = (parentId: string): string[] => {
              return currentEntities
                .filter((e) => e.properties?.parentId === parentId)
                .flatMap((e) => [e.id, ...collectDescendants(e.id)]);
            };
            const toDelete = [id, ...collectDescendants(id)];
            toDelete.forEach((entityId) => removeEntity(entityId));
            const remaining = currentEntities.filter((e) => !toDelete.includes(e.id));
            if (effectiveViewId && selectedWikiPageId && toDelete.includes(selectedWikiPageId)) {
              const nextId = remaining[0]?.id ?? null;
              if (nextId) {
                setLastWikiPageForProjectView(activeProjectId, effectiveViewId, nextId);
              }
              navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: nextId ?? undefined }), { replace: false });
            }
          }}
          onWikiUpdate={modifyEntity}
          onWikiEntityClick={(e) => {
            // Opening a task from wiki should not clobber the wiki page URL.
            setOverlayEntity(e);
          }}
          onServerEntity={applyServerEntity}
          searchQuery={searchQueryFromLocation}
          wikiCreateRef={wikiCreateRef}
          notesPane={notesPaneForPanel}
        />
      </div>

      <NotePanePagePickerDialog
        open={notePanePickerOpen}
        pages={wikiPagesForNotes}
        targetViewId={notePanePickerTargetViewId}
        onClose={() => {
          setNotePanePickerOpen(false);
          setNotePanePickerTargetViewId(null);
        }}
        onConfirm={handleNotePanePickerConfirm}
      />

      <WorkspaceOverlays
        commandPaletteOpen={commandPaletteOpen}
        onCommandPaletteOpenChange={setCommandPaletteOpen}
        aiCommandOpen={aiCommandOpen}
        onAICommandOpenChange={setAICommandOpen}
        onCreateEntity={
          currentView.type === 'wiki'
            ? () => wikiCreateRef.current?.()
            : handleCreateEntity
        }
        activeProjectId={activeProjectId}
        activeProjectKey={activeProjectKey}
        projectKeyById={projectKeyById}
        onSelectSearchResult={handleSearchResultSelect}
        onTransform={updateManifest}
        onReload={handleProjectReload}
        manifest={manifest}
        overlayEntity={overlayEntity}
        selectedEntityFromUrl={selectedEntityFromUrl}
        currentView={currentView}
        currentEntity={currentEntity}
        currentEntities={currentEntities}
        effectiveViewId={effectiveViewId ?? undefined}
        entities={entities}
        onCloseOverlayEntity={() => setOverlayEntity(null)}
        onSelectOverlayEntity={(entity) => setOverlayEntity(entity)}
        onEntityUpdate={modifyEntity}
        onServerEntity={applyServerEntity}
        onDeleteEntity={removeEntity}
        onAddPropertyDefinition={handleAddPropertyDefinition}
        onRemovePropertyDefinition={handleRemovePropertyDefinition}
        onReorderProperties={handleReorderProperties}
        onUpsertPropertyOption={handleUpsertPropertyOption}
        usersById={usersById}
        onResolveUsers={resolveUsers}
        boardConfigOpen={boardConfigOpen}
        onBoardConfigOpenChange={setBoardConfigOpen}
        onBoardViewSave={(updatedView: ViewConfig) => {
          updateViewConfig(currentView.id, () => updatedView);
        }}
        policyDialogOpen={policyDialogOpen}
        onPolicyDialogOpenChange={setPolicyDialogOpen}
        projectNameForPolicy={projects.find((p) => p.id === activeProjectId)?.name || activeProjectId}
        onPolicySaved={() => {
          refreshActiveProject({ bypassProjectRefreshBlock: true }).catch((e) =>
            console.error('Failed to refresh project:', e)
          );
        }}
        projectDetailDialogOpen={projectDetailDialogOpen}
        onProjectDetailDialogOpenChange={setProjectDetailDialogOpen}
        activeProject={activeProject}
        projectMeta={projects.find((p) => p.id === activeProjectId) || null}
        onRenameProject={renameProject}
        onDeleteProject={async (projectId: string) => {
          const result = await deleteProject(projectId);
          if (!result.wasActive) return;
          if (result.projects.length > 0) {
            navigate(`/p/${encodeURIComponent(result.activeProjectId)}`, { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }}
        onOpenPolicyFromDetail={() => setPolicyDialogOpen(true)}
        scmIntegrationEnabled={scmIntegrationEnabled}
        progressOpen={progressOpen}
        progressTitle={progressTitle}
        progressEvents={progressEvents}
        progressRunning={progressRunning}
        onProgressCancel={handleProgressCancel}
        onProgressClose={handleProgressClose}
        buildPath={buildPath}
        detailNavEntityIds={detailNavEntityIds}
        entityDetailBackdropExcludeLeftPx={notesPaneForPanel?.widthPx ?? 0}
      />
    </div>
  );
}

