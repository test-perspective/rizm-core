import { useNavigate } from 'react-router-dom';

import { AICommandBar } from '../AICommandBar';
import { BoardConfigDialog } from '../BoardConfigDialog';
import { CommandPalette } from '../CommandPalette';
import { EntityDetailPanel } from '../EntityDetailPanel';
import { EntityDetailPanelErrorBoundary } from '../EntityDetailPanelErrorBoundary';
import { ProjectDetailDialog } from '../ProjectDetailDialog';
import { ProjectPolicyDialog } from '../ProjectPolicyDialog';
import { AiProgressDialog, AiProgressEvent } from '../aiCommandBar/AiProgressDialog';
import type { SearchResult } from '../../api/search';
import type {
  Entity,
  EntityDefinition,
  Project,
  ProjectManifest,
  ProjectMeta,
  PropertyDefinition,
  ViewConfig,
} from '../../types';

type BuildPathFn = (params: { projectId: string; viewId: string; entityId?: string | null }) => string;

type WorkspaceOverlaysProps = {
  commandPaletteOpen: boolean;
  onCommandPaletteOpenChange: (open: boolean) => void;
  aiCommandOpen: boolean;
  onAICommandOpenChange: (open: boolean) => void;
  onCreateEntity: () => void;
  activeProjectId: string;
  activeProjectKey: string;
  projectKeyById: Map<string, string>;
  onSelectSearchResult: (result: SearchResult, query: string) => void;
  onTransform: (newManifest: ProjectManifest, options?: { source?: string }) => void;
  onReload: () => Promise<void>;
  manifest: ProjectManifest;
  overlayEntity: Entity | null;
  selectedEntityFromUrl: Entity | null;
  currentView: ViewConfig;
  currentEntity: EntityDefinition;
  currentEntities: Entity[];
  effectiveViewId?: string;
  entities: Entity[];
  onCloseOverlayEntity: () => void;
  onSelectOverlayEntity: (entity: Entity) => void;
  onEntityUpdate: (id: string, patch: Record<string, any>) => void;
  onServerEntity: (entity: Entity, etag: string) => void;
  onDeleteEntity: (id: string) => void;
  onAddPropertyDefinition: (prop: PropertyDefinition) => Promise<void>;
  onRemovePropertyDefinition: (propName: string) => Promise<void>;
  onReorderProperties?: (orderedPropNames: string[]) => Promise<void>;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => Promise<void>;
  usersById: Record<string, any>;
  onResolveUsers: (userIds: string[]) => void;
  boardConfigOpen: boolean;
  onBoardConfigOpenChange: (open: boolean) => void;
  onBoardViewSave: (updatedView: ViewConfig) => void;
  policyDialogOpen: boolean;
  onPolicyDialogOpenChange: (open: boolean) => void;
  projectNameForPolicy: string;
  onPolicySaved: () => void;
  projectDetailDialogOpen: boolean;
  onProjectDetailDialogOpenChange: (open: boolean) => void;
  activeProject: Project | null;
  projectMeta: ProjectMeta | null;
  onRenameProject: (name: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onOpenPolicyFromDetail: () => void;
  scmIntegrationEnabled: boolean;
  progressOpen: boolean;
  progressTitle: string;
  progressEvents: AiProgressEvent[];
  progressRunning: boolean;
  onProgressCancel: () => void;
  onProgressClose: () => void;
  buildPath: BuildPathFn;
  /** Ordered entity ids for ArrowLeft/ArrowRight in detail (table: current page, board: same lane). */
  detailNavEntityIds?: string[];
  /** REQ-288: skip dim/blur over the embedded notes pane (pixels from left edge). */
  entityDetailBackdropExcludeLeftPx?: number;
};

export function WorkspaceOverlays(props: WorkspaceOverlaysProps) {
  const navigate = useNavigate();
  const {
    commandPaletteOpen,
    onCommandPaletteOpenChange,
    aiCommandOpen,
    onAICommandOpenChange,
    onCreateEntity,
    activeProjectId,
    activeProjectKey,
    projectKeyById,
    onSelectSearchResult,
    onTransform,
    onReload,
    manifest,
    overlayEntity,
    selectedEntityFromUrl,
    currentView,
    currentEntity,
    currentEntities,
    effectiveViewId,
    entities,
    onCloseOverlayEntity,
    onSelectOverlayEntity,
    onEntityUpdate,
    onServerEntity,
    onDeleteEntity,
    onAddPropertyDefinition,
    onRemovePropertyDefinition,
    onReorderProperties,
    onUpsertPropertyOption,
    usersById,
    onResolveUsers,
    boardConfigOpen,
    onBoardConfigOpenChange,
    onBoardViewSave,
    policyDialogOpen,
    onPolicyDialogOpenChange,
    projectNameForPolicy,
    onPolicySaved,
    projectDetailDialogOpen,
    onProjectDetailDialogOpenChange,
    activeProject,
    projectMeta,
    onRenameProject,
    onDeleteProject,
    onOpenPolicyFromDetail,
    scmIntegrationEnabled,
    progressOpen,
    progressTitle,
    progressEvents,
    progressRunning,
    onProgressCancel,
    onProgressClose,
    buildPath,
    detailNavEntityIds = [],
    entityDetailBackdropExcludeLeftPx = 0,
  } = props;

  const detailSchemaEntity: EntityDefinition =
    overlayEntity != null
      ? manifest.entities.find((d) => d.id === overlayEntity.entityId) ?? currentEntity
      : currentEntity;
  const detailTitleLikeProperty = manifest.entities.find((e) => e.id === detailSchemaEntity.id)?.titleLikeProperty;

  const urlDetailEntity = overlayEntity == null ? selectedEntityFromUrl : null;
  const enableDetailArrowNav =
    overlayEntity == null &&
    urlDetailEntity != null &&
    effectiveViewId != null &&
    (currentView.type === 'table' || currentView.type === 'board');

  const onNavigateDetailPrev =
    enableDetailArrowNav && detailNavEntityIds.length > 0
      ? () => {
          const id = urlDetailEntity!.id;
          const i = detailNavEntityIds.indexOf(id);
          if (i <= 0) return;
          navigate(
            buildPath({
              projectId: activeProjectId,
              viewId: effectiveViewId!,
              entityId: detailNavEntityIds[i - 1],
            }),
            { replace: false }
          );
        }
      : undefined;

  const onNavigateDetailNext =
    enableDetailArrowNav && detailNavEntityIds.length > 0
      ? () => {
          const id = urlDetailEntity!.id;
          const i = detailNavEntityIds.indexOf(id);
          if (i < 0 || i >= detailNavEntityIds.length - 1) return;
          navigate(
            buildPath({
              projectId: activeProjectId,
              viewId: effectiveViewId!,
              entityId: detailNavEntityIds[i + 1],
            }),
            { replace: false }
          );
        }
      : undefined;

  return (
    <>
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => onCommandPaletteOpenChange(false)}
        onAICommand={() => {
          onCommandPaletteOpenChange(false);
          onAICommandOpenChange(true);
        }}
        onCreateEntity={() => {
          onCommandPaletteOpenChange(false);
          onCreateEntity();
        }}
        activeProjectId={activeProjectId}
        activeProjectKey={activeProjectKey}
        projectKeyById={projectKeyById}
        onSelectResult={onSelectSearchResult}
      />

      <AICommandBar
        isOpen={aiCommandOpen}
        onClose={() => onAICommandOpenChange(false)}
        onTransform={onTransform}
        projectId={activeProjectId}
        onReload={onReload}
        currentManifest={manifest}
      />

      {(overlayEntity || selectedEntityFromUrl) &&
        (currentView.type !== 'wiki' ||
          !currentEntities.some((e) => e.id === (overlayEntity ?? selectedEntityFromUrl)!.id)) && (
          <EntityDetailPanelErrorBoundary
            entityId={(overlayEntity ?? selectedEntityFromUrl)!.id}
            entityProperties={(overlayEntity ?? selectedEntityFromUrl)!.properties}
            onClose={() => {
              if (overlayEntity) {
                onCloseOverlayEntity();
                return;
              }
              if (effectiveViewId) {
                navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId }), { replace: false });
              }
            }}
          >
          <EntityDetailPanel
            entity={overlayEntity ?? selectedEntityFromUrl}
            projectId={activeProjectId}
            entityTypeId={detailSchemaEntity.id}
            viewId={currentView.id}
            properties={detailSchemaEntity.properties}
            titleLikeProperty={detailTitleLikeProperty}
            allowSchemaEdit={overlayEntity == null}
            entities={entities}
            onClose={() => {
              if (overlayEntity) {
                onCloseOverlayEntity();
                return;
              }
              if (effectiveViewId) {
                navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId }), { replace: false });
              }
            }}
            onUpdate={onEntityUpdate}
            onServerEntity={onServerEntity}
            onDelete={onDeleteEntity}
            onAddPropertyDefinition={onAddPropertyDefinition}
            onRemovePropertyDefinition={onRemovePropertyDefinition}
            onReorderProperties={onReorderProperties}
            onUpsertPropertyOption={onUpsertPropertyOption}
            onEntityClick={(e) => {
              if (currentView.type === 'wiki') {
                onSelectOverlayEntity(e);
                return;
              }
              if (effectiveViewId) {
                navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: e.id }), { replace: false });
              }
            }}
            usersById={usersById}
            onResolveUsers={onResolveUsers}
            onNavigateDetailPrev={onNavigateDetailPrev}
            onNavigateDetailNext={onNavigateDetailNext}
            backdropExcludeLeftPx={entityDetailBackdropExcludeLeftPx}
          />
          </EntityDetailPanelErrorBoundary>
        )}

      {currentView.type === 'board' && (
        <BoardConfigDialog
          isOpen={boardConfigOpen}
          onClose={() => onBoardConfigOpenChange(false)}
          view={currentView}
          groupByProperty={currentEntity.properties.find((p) => p.name === currentView.groupBy) ?? null}
          onSave={onBoardViewSave}
        />
      )}

      {policyDialogOpen && (
        <ProjectPolicyDialog
          projectId={activeProjectId}
          projectName={projectNameForPolicy}
          open={policyDialogOpen}
          onClose={() => onPolicyDialogOpenChange(false)}
          onSave={onPolicySaved}
        />
      )}

      {projectDetailDialogOpen && (
        <ProjectDetailDialog
          project={activeProject}
          projectMeta={projectMeta}
          open={projectDetailDialogOpen}
          onClose={() => onProjectDetailDialogOpenChange(false)}
          onRename={onRenameProject}
          onDelete={onDeleteProject}
          onAICommand={() => onAICommandOpenChange(true)}
          onOpenPolicy={onOpenPolicyFromDetail}
          scmIntegrationEnabled={scmIntegrationEnabled}
        />
      )}

      <AiProgressDialog
        isOpen={progressOpen}
        title={progressTitle}
        events={progressEvents}
        isRunning={progressRunning}
        onCancel={onProgressCancel}
        onClose={onProgressClose}
      />
    </>
  );
}
