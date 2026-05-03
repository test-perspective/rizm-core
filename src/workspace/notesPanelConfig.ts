import type { NavigateFunction } from 'react-router-dom';
import type { Entity, Project, ProjectManifest, ProjectMeta, ViewConfig } from '../types';
import type { ViewTitleNotesMenu } from '../components/BoardViewMenu';
import type { WorkspaceNotesPaneConfig } from '../components/workspace/WorkspaceViewPanel';
import type { NotePanePrefs } from './notePaneStorage';
import { setLastViewForProject } from './storage';
import { setNotePanePrefs } from './notePaneStorage';

type BuildPath = (args: { projectId: string; viewId: string; entityId?: string | null }) => string;

export type NotesConfigInput = {
  wikiViewConfig: { viewId: string; entityId: string } | null;
  currentView: ViewConfig;
  effectiveViewId: string | null | undefined;
  activeProjectId: string;
  notePaneLocal: NotePanePrefs;
  wikiPagesForNotes: Entity[];
  setNotePaneLocal: React.Dispatch<React.SetStateAction<NotePanePrefs>>;
  hideNotePaneForView: (viewId: string) => void;
  openNotePanePickerForView: (viewId: string) => void;
  addEntity: (entityTypeId: string, props: Record<string, unknown>) => any;
  modifyEntity: (id: string, patch: Record<string, any>) => any;
  handleNotesWikiDelete: (id: string) => void;
  setOverlayEntity: (e: Entity | null) => void;
  refreshActiveProject: (opts?: { bypassProjectRefreshBlock?: boolean }) => Promise<Project | null>;
  applyServerEntity: (entity: Entity, etag: string) => void;
  searchQueryFromLocation: string | undefined;
  projects: ProjectMeta[];
  manifest: ProjectManifest;
  navigate: NavigateFunction;
  buildPath: BuildPath;
  sidebarRef: React.RefObject<{ openNewProject: () => void } | null>;
  setProjectDetailDialogOpen: (v: boolean) => void;
};

export type NotesConfigResult = {
  notesOccludeSidebar: boolean;
  viewTitleNotesMenu: ViewTitleNotesMenu | undefined;
  notesPaneForPanel: WorkspaceNotesPaneConfig | null;
  headerNotesChrome:
    | {
        projects: ProjectMeta[];
        activeProjectId: string;
        onProjectChange: (projectId: string) => void;
        visibleViews: ViewConfig[];
        currentViewId: string;
        onViewChange: (viewId: string) => void;
        onOpenProjectDetail: () => void;
        onAddProject: () => void;
      }
    | null;
};

export function buildNotesConfig(input: NotesConfigInput): NotesConfigResult {
  const {
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
  } = input;

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
          } as WorkspaceNotesPaneConfig;
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

  return { notesOccludeSidebar, viewTitleNotesMenu, notesPaneForPanel, headerNotesChrome };
}
