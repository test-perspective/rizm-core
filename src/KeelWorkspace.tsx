import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useKeel } from './hooks/useKeel';
import { type SidebarHandle } from './components/Sidebar';
import { Entity } from './types';
import { useAppDialog } from './components/dialogs';
import { consumeReturnToProjectDetailsAfterScmOAuth } from './workspace/storage';
import { useResolvedUsers } from './workspace/useResolvedUsers';
import { useWorkspaceRouting } from './workspace/useWorkspaceRouting';
import { useCreateEntityHandler } from './workspace/useCreateEntityHandler';
import { resolveViewIdForSearchKind } from './workspace/searchRouting';
import { useWorkspaceManifestHandlers } from './workspace/useWorkspaceManifestHandlers';
import { WorkspaceStateScreens } from './components/workspace/WorkspaceStateScreens';
import { useCreateProjectHandler } from './workspace/useCreateProjectHandler';
import { fetchProjectState } from './api/projects';
import type { SearchResult } from './api/search';
import { useNotePaneState } from './workspace/useNotePaneState';
import { useRenameBoardColumn } from './workspace/useRenameBoardColumn';
import { buildNotesConfig } from './workspace/notesPanelConfig';
import { setLastWikiPageForProjectView } from './workspace/storage';
import { WorkspaceBody } from './components/workspace/WorkspaceBody';

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

  const {
    notePaneLocal,
    setNotePaneLocal,
    notePanePickerOpen,
    setNotePanePickerOpen,
    notePanePickerTargetViewId,
    setNotePanePickerTargetViewId,
    hideNotePaneForView,
    openNotePanePickerForView,
    handleNotePanePickerConfirm,
    handleNotesWikiDelete,
  } = useNotePaneState({
    activeProjectId,
    effectiveViewId,
    currentView,
    wikiPagesForNotes,
    navigate,
    buildPath,
    removeEntity,
  });

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

  const handleRenameBoardColumn = useRenameBoardColumn({
    manifest,
    currentView,
    entities,
    activeProjectId,
    updateSchema,
    modifyEntity,
    setProjectRefreshBlocked,
    refreshActiveProject,
    dialog,
    setBoardColumnRenameBusy,
  });

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

  const { notesOccludeSidebar, viewTitleNotesMenu, notesPaneForPanel, headerNotesChrome } =
    buildNotesConfig({
      wikiViewConfig,
      currentView,
      effectiveViewId,
      activeProjectId,
      notePaneLocal,
      wikiPagesForNotes,
      setNotePaneLocal,
      hideNotePaneForView,
      openNotePanePickerForView,
      addEntity,
      modifyEntity,
      handleNotesWikiDelete,
      setOverlayEntity,
      refreshActiveProject,
      applyServerEntity,
      searchQueryFromLocation,
      projects,
      manifest,
      navigate,
      buildPath,
      sidebarRef,
      setProjectDetailDialogOpen,
    });

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
    <WorkspaceBody
      projects={projects}
      activeProjectId={activeProjectId}
      activeProject={activeProject}
      activeProjectKey={activeProjectKey}
      projectKeyById={projectKeyById}
      manifest={manifest}
      currentView={currentView}
      currentEntity={currentEntity}
      currentEntities={currentEntities}
      entities={entities}
      effectiveViewId={effectiveViewId}
      selectedWikiPageId={selectedWikiPageId}
      selectedEntityFromUrl={selectedEntityFromUrl}
      urlEntityId={urlEntityId}
      usersById={usersById}
      overlayEntity={overlayEntity}
      scmIntegrationEnabled={scmIntegrationEnabled}
      boardColumnRenameBusy={boardColumnRenameBusy}
      detailNavEntityIds={detailNavEntityIds}
      searchQueryFromLocation={searchQueryFromLocation}
      notesOccludeSidebar={notesOccludeSidebar}
      viewTitleNotesMenu={viewTitleNotesMenu}
      notesPaneForPanel={notesPaneForPanel}
      headerNotesChrome={headerNotesChrome}
      notePanePickerOpen={notePanePickerOpen}
      notePanePickerTargetViewId={notePanePickerTargetViewId}
      wikiPagesForNotes={wikiPagesForNotes}
      commandPaletteOpen={commandPaletteOpen}
      aiCommandOpen={aiCommandOpen}
      boardConfigOpen={boardConfigOpen}
      policyDialogOpen={policyDialogOpen}
      projectDetailDialogOpen={projectDetailDialogOpen}
      progressOpen={progressOpen}
      progressTitle={progressTitle}
      progressEvents={progressEvents}
      progressRunning={progressRunning}
      wikiCreateRef={wikiCreateRef}
      sidebarRef={sidebarRef}
      navigate={navigate}
      buildPath={buildPath}
      setCommandPaletteOpen={setCommandPaletteOpen}
      setAICommandOpen={setAICommandOpen}
      setBoardConfigOpen={setBoardConfigOpen}
      setPolicyDialogOpen={setPolicyDialogOpen}
      setProjectDetailDialogOpen={setProjectDetailDialogOpen}
      setOverlayEntity={setOverlayEntity}
      setNotePanePickerOpen={setNotePanePickerOpen}
      setNotePanePickerTargetViewId={setNotePanePickerTargetViewId}
      handleCreateProject={handleCreateProject}
      handleCreateEntity={handleCreateEntity}
      handleNavigateEntity={handleNavigateEntity}
      handleSearchResultSelect={handleSearchResultSelect}
      handleNotePanePickerConfirm={handleNotePanePickerConfirm}
      handleDetailNavEntityOrderChange={handleDetailNavEntityOrderChange}
      handleRenameBoardColumn={handleRenameBoardColumn}
      handleAddPropertyDefinition={handleAddPropertyDefinition}
      handleRemovePropertyDefinition={handleRemovePropertyDefinition}
      handleReorderProperties={handleReorderProperties}
      handleUpsertPropertyOption={handleUpsertPropertyOption}
      handleProjectReload={handleProjectReload}
      handleProgressCancel={handleProgressCancel}
      handleProgressClose={handleProgressClose}
      addEntity={addEntity}
      modifyEntity={modifyEntity}
      removeEntity={removeEntity}
      updateManifest={updateManifest}
      updateViewConfig={updateViewConfig}
      updateSchema={updateSchema}
      applyServerEntity={applyServerEntity}
      refreshActiveProject={refreshActiveProject}
      resolveUsers={resolveUsers}
      renameProject={renameProject}
      deleteProject={deleteProject}
    />
  );
}
