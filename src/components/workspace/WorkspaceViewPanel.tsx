import type { MutableRefObject } from 'react';
import type { Entity, EntityDefinition, ProjectMeta, UserSummary, ViewConfig } from '../../types';
import { BoardView } from '../BoardView';
import { TableView } from '../TableView';
import { WikiView } from '../WikiView';

type WorkspaceViewPanelProps = {
  currentView: ViewConfig;
  currentEntity: EntityDefinition;
  currentEntities: Entity[];
  entities: Entity[];
  projects: ProjectMeta[];
  activeProjectId: string;
  activeProjectKey: string;
  scmIntegrationEnabled: boolean;
  effectiveViewId?: string;
  selectedWikiPageId: string | null;
  /** URL entity segment when present — used for board lane detail navigation order. */
  detailUrlEntityId?: string | null;
  onDetailNavEntityOrderChange?: (entityIds: string[]) => void;
  usersById: Record<string, UserSummary>;
  onResolveUsers: (userIds: string[]) => void;
  onNavigateEntity: (entityId: string) => void;
  onEntityUpdate: (entityId: string, patch: Record<string, any>) => void;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => void;
  onViewConfigUpdate: (view: ViewConfig) => void;
  onRefreshProject: () => void | Promise<unknown>;
  onRenameBoardColumn?: (from: string, to: string) => void | Promise<void>;
  boardColumnRenameBusy?: boolean;
  onWikiSelect: (id: string) => void;
  onWikiCreate: (opts?: { parentId?: string | null; nodeType?: 'page' | 'folder' }) => Entity;
  onWikiDelete: (id: string) => void;
  onWikiUpdate: (id: string, patch: Record<string, any>) => void;
  onWikiEntityClick: (entity: Entity) => void;
  onServerEntity: (entity: Entity, etag: string) => void;
  searchQuery?: string;
  wikiCreateRef?: MutableRefObject<(() => void) | null>;
};

export function WorkspaceViewPanel({
  currentView,
  currentEntity,
  currentEntities,
  entities,
  projects,
  activeProjectId,
  activeProjectKey,
  scmIntegrationEnabled,
  effectiveViewId,
  selectedWikiPageId,
  detailUrlEntityId = null,
  onDetailNavEntityOrderChange,
  usersById,
  onResolveUsers,
  onNavigateEntity,
  onEntityUpdate,
  onUpsertPropertyOption,
  onViewConfigUpdate,
  onRefreshProject,
  onRenameBoardColumn,
  boardColumnRenameBusy = false,
  onWikiSelect,
  onWikiCreate,
  onWikiDelete,
  onWikiUpdate,
  onWikiEntityClick,
  onServerEntity,
  searchQuery,
  wikiCreateRef,
}: WorkspaceViewPanelProps) {
  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
      {currentView.type === 'list' && (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl text-zinc-400 mb-2">?????????????</p>
            <p className="text-sm text-zinc-500">List view?????????Table view?????????</p>
          </div>
        </div>
      )}
      {currentView.type === 'board' && (
        <BoardView
          entities={currentEntities}
          view={currentView}
          properties={currentEntity.properties}
          projectId={activeProjectId}
          scmIntegrationEnabled={scmIntegrationEnabled}
          onEntityClick={(e) => {
            if (effectiveViewId) {
              onNavigateEntity(e.id);
            }
          }}
          onEntityUpdate={onEntityUpdate}
          onViewConfigUpdate={(updatedView: ViewConfig) => {
            onViewConfigUpdate(updatedView);
          }}
          allEntities={entities}
          usersById={usersById}
          onRenameBoardColumn={onRenameBoardColumn}
          columnRenameInProgress={boardColumnRenameBusy}
          openDetailEntityId={detailUrlEntityId}
          onBoardLaneEntityOrderForDetailChange={onDetailNavEntityOrderChange}
        />
      )}
      {currentView.type === 'table' && (
        <TableView
          entities={currentEntities}
          view={currentView}
          properties={currentEntity.properties}
          onEntityUpdate={onEntityUpdate}
          onUpsertPropertyOption={onUpsertPropertyOption}
          onEntityClick={(e) => {
            if (effectiveViewId) {
              onNavigateEntity(e.id);
            }
          }}
          allEntities={entities}
          projectId={activeProjectId}
          projectKey={activeProjectKey}
          usersById={usersById}
          onResolveUsers={onResolveUsers}
          onReload={onRefreshProject}
          onTablePageEntityOrderChange={onDetailNavEntityOrderChange}
        />
      )}
      {currentView.type === 'wiki' && (
        <WikiView
          projectId={activeProjectId}
          viewId={effectiveViewId ?? currentView.id}
          projects={projects}
          pages={currentEntities}
          selectedPageId={selectedWikiPageId}
          onRefreshProject={onRefreshProject}
          onSelectPage={onWikiSelect}
          onCreatePage={(opts) => onWikiCreate(opts)}
          onDeletePage={onWikiDelete}
          onUpdatePage={onWikiUpdate}
          entities={entities}
          onEntityClick={onWikiEntityClick}
          onServerEntity={onServerEntity}
          searchQuery={searchQuery}
          wikiCreateRef={wikiCreateRef}
        />
      )}
    </div>
  );
}

