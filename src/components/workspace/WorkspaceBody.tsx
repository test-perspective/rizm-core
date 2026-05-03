import type { MutableRefObject } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { Sidebar, type SidebarHandle } from '../Sidebar';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceViewPanel, type WorkspaceNotesPaneConfig } from './WorkspaceViewPanel';
import { NotePanePagePickerDialog } from './NotePanePagePickerDialog';
import { WorkspaceOverlays } from './WorkspaceOverlays';
import type { ViewTitleNotesMenu } from '../BoardViewMenu';
import type { Entity, EntityDefinition, Project, ProjectManifest, ProjectMeta, ViewConfig } from '../../types';
import type { SearchResult } from '../../api/search';
import { reorderViews } from '../../utils/manifestMutations';
import {
  setLastViewForProject,
  setLastWikiPageForProjectView,
} from '../../workspace/storage';

type BuildPath = (args: { projectId: string; viewId: string; entityId?: string | null }) => string;

export type WorkspaceBodyProps = {
  // Data
  projects: ProjectMeta[];
  activeProjectId: string;
  activeProject: Project;
  activeProjectKey: string;
  projectKeyById: Map<string, string>;
  manifest: ProjectManifest;
  currentView: ViewConfig;
  currentEntity: EntityDefinition;
  currentEntities: Entity[];
  entities: Entity[];
  effectiveViewId: string | null | undefined;
  selectedWikiPageId: string | null;
  selectedEntityFromUrl: Entity | null;
  urlEntityId: string | undefined;
  usersById: Record<string, any>;
  overlayEntity: Entity | null;
  scmIntegrationEnabled: boolean;
  boardColumnRenameBusy: boolean;
  detailNavEntityIds: string[];
  searchQueryFromLocation: string | undefined;

  // Note pane state
  notesOccludeSidebar: boolean;
  viewTitleNotesMenu: ViewTitleNotesMenu | undefined;
  notesPaneForPanel: WorkspaceNotesPaneConfig | null;
  headerNotesChrome: any;
  notePanePickerOpen: boolean;
  notePanePickerTargetViewId: string | null;
  wikiPagesForNotes: Entity[];

  // Dialog open state
  commandPaletteOpen: boolean;
  aiCommandOpen: boolean;
  boardConfigOpen: boolean;
  policyDialogOpen: boolean;
  projectDetailDialogOpen: boolean;

  // Progress
  progressOpen: boolean;
  progressTitle: string;
  progressEvents: any[];
  progressRunning: boolean;

  // Refs
  wikiCreateRef: MutableRefObject<(() => void) | null>;
  sidebarRef: React.Ref<SidebarHandle>;

  // Actions
  navigate: NavigateFunction;
  buildPath: BuildPath;
  setCommandPaletteOpen: (v: boolean) => void;
  setAICommandOpen: (v: boolean) => void;
  setBoardConfigOpen: (v: boolean) => void;
  setPolicyDialogOpen: (v: boolean) => void;
  setProjectDetailDialogOpen: (v: boolean) => void;
  setOverlayEntity: (e: Entity | null) => void;
  setNotePanePickerOpen: (v: boolean) => void;
  setNotePanePickerTargetViewId: (v: string | null) => void;
  handleCreateProject: (opts: any) => void;
  handleCreateEntity: () => void;
  handleNavigateEntity: (entityId: string) => void;
  handleSearchResultSelect: (result: SearchResult, query: string) => void;
  handleNotePanePickerConfirm: (pageId: string, targetViewId: string) => void;
  handleDetailNavEntityOrderChange: (ids: string[]) => void;
  handleRenameBoardColumn: (from: string, to: string) => Promise<void>;
  handleAddPropertyDefinition: any;
  handleRemovePropertyDefinition: any;
  handleReorderProperties: any;
  handleUpsertPropertyOption: any;
  handleProjectReload: (...args: any[]) => any;
  handleProgressCancel: (...args: any[]) => any;
  handleProgressClose: (...args: any[]) => any;
  addEntity: (entityTypeId: string, props: Record<string, unknown>) => any;
  modifyEntity: (id: string, patch: Record<string, any>) => any;
  removeEntity: (id: string) => void;
  updateManifest: (next: ProjectManifest, options?: any) => void;
  updateViewConfig: (viewId: string, updater: (v: ViewConfig) => ViewConfig) => void;
  updateSchema: (next: ProjectManifest) => void;
  applyServerEntity: (entity: Entity, etag: string) => void;
  refreshActiveProject: (opts?: { bypassProjectRefreshBlock?: boolean }) => Promise<any>;
  resolveUsers: (ids: string[]) => void;
  renameProject: (...args: any[]) => any;
  deleteProject: (id: string) => Promise<any>;
};

export function WorkspaceBody(props: WorkspaceBodyProps) {
  const {
    projects,
    activeProjectId,
    activeProject,
    activeProjectKey,
    projectKeyById,
    manifest,
    currentView,
    currentEntity,
    currentEntities,
    entities,
    effectiveViewId,
    selectedWikiPageId,
    selectedEntityFromUrl,
    urlEntityId,
    usersById,
    overlayEntity,
    scmIntegrationEnabled,
    boardColumnRenameBusy,
    detailNavEntityIds,
    searchQueryFromLocation,
    notesOccludeSidebar,
    viewTitleNotesMenu,
    notesPaneForPanel,
    headerNotesChrome,
    notePanePickerOpen,
    notePanePickerTargetViewId,
    wikiPagesForNotes,
    commandPaletteOpen,
    aiCommandOpen,
    boardConfigOpen,
    policyDialogOpen,
    projectDetailDialogOpen,
    progressOpen,
    progressTitle,
    progressEvents,
    progressRunning,
    wikiCreateRef,
    sidebarRef,
    navigate,
    buildPath,
    setCommandPaletteOpen,
    setAICommandOpen,
    setBoardConfigOpen,
    setPolicyDialogOpen,
    setProjectDetailDialogOpen,
    setOverlayEntity,
    setNotePanePickerOpen,
    setNotePanePickerTargetViewId,
    handleCreateProject,
    handleCreateEntity,
    handleNavigateEntity,
    handleSearchResultSelect,
    handleNotePanePickerConfirm,
    handleDetailNavEntityOrderChange,
    handleRenameBoardColumn,
    handleAddPropertyDefinition,
    handleRemovePropertyDefinition,
    handleReorderProperties,
    handleUpsertPropertyOption,
    handleProjectReload,
    handleProgressCancel,
    handleProgressClose,
    addEntity,
    modifyEntity,
    removeEntity,
    updateManifest,
    updateViewConfig,
    applyServerEntity,
    refreshActiveProject,
    resolveUsers,
    renameProject,
    deleteProject,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-1 bg-zinc-950 text-white overflow-hidden">
      <Sidebar
        ref={sidebarRef}
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectChange={(projectId) => {
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
            const p: Record<string, unknown> = { title: '', doc: '' };
            if (opts?.parentId !== undefined) p.parentId = opts.parentId;
            if (opts?.nodeType) p.nodeType = opts.nodeType;
            return addEntity(currentView.entityId, p);
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
