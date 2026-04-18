import { Plus } from 'lucide-react';
import type { EntityDefinition, ProjectMeta, ViewConfig } from '../../types';
import { BoardViewMenu, type ViewTitleNotesMenu } from '../BoardViewMenu';
import { ProjectOverflowMenu } from '../sidebar/ProjectOverflowMenu';

export type WorkspaceNotesChromeProps = {
  projects: ProjectMeta[];
  activeProjectId: string;
  onProjectChange: (id: string) => void;
  visibleViews: ViewConfig[];
  currentViewId: string;
  onViewChange: (id: string) => void;
  onOpenProjectDetail?: () => void;
  onAddProject: () => void;
};

type WorkspaceHeaderProps = {
  currentView: ViewConfig;
  currentEntity: EntityDefinition;
  currentEntities: Entity[];
  onOpenCommandPalette: () => void;
  onCreateEntity: () => void;
  onOpenBoardConfig: () => void;
  /** REQ-288: Board/Table title ⋯ — open/hide notes pane */
  viewTitleNotes?: ViewTitleNotesMenu | null;
  /** REQ-288: when sidebar is hidden for notes pane, show project/view controls + project menu here */
  notesChrome?: WorkspaceNotesChromeProps | null;
};

export function WorkspaceHeader({
  currentView,
  currentEntity,
  currentEntities,
  onOpenCommandPalette,
  onCreateEntity,
  onOpenBoardConfig,
  viewTitleNotes = null,
  notesChrome = null,
}: WorkspaceHeaderProps) {
  const showTitleOverflow =
    currentView.type === 'board' || currentView.type === 'table';

  return (
    <div className="border-b border-zinc-800 bg-zinc-950">
      {notesChrome && (
        <div
          className="flex flex-wrap items-center gap-2 px-6 pt-3 pb-2 border-b border-zinc-800/80"
          data-testid="workspace-header-notes-chrome"
        >
          <img src="/brand/logo.png" alt="Rizm" className="h-6 shrink-0" />
          <select
            value={notesChrome.activeProjectId}
            onChange={(e) => notesChrome.onProjectChange(e.target.value)}
            className="min-w-0 max-w-[200px] bg-zinc-900 border border-zinc-800 text-white text-sm rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-600"
            aria-label="Project"
          >
            {notesChrome.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.projectKey ? ` (${p.projectKey})` : ''}
              </option>
            ))}
          </select>
          <ProjectOverflowMenu
            onOpenProjectDetail={notesChrome.onOpenProjectDetail}
            onAddProject={notesChrome.onAddProject}
            menuButtonTestId="workspace-header-project-overflow-menu"
          />
          <select
            value={notesChrome.currentViewId}
            onChange={(e) => notesChrome.onViewChange(e.target.value)}
            className="min-w-0 max-w-[200px] bg-zinc-900 border border-zinc-800 text-white text-sm rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-600"
            aria-label="View"
          >
            {notesChrome.visibleViews.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{currentView.name}</h1>
          {showTitleOverflow && (
            <BoardViewMenu
              onConfigClick={currentView.type === 'board' ? onOpenBoardConfig : undefined}
              notes={viewTitleNotes ?? undefined}
              menuButtonTestId="view-title-overflow-menu"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-500">
            {currentEntities.length}{' '}
            {currentEntities.length === 1 ? currentEntity.name : currentEntity.namePlural}
          </p>
          <button
            onClick={onOpenCommandPalette}
            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-sm text-zinc-400 transition-colors flex items-center gap-2"
          >
            <span>Search</span>
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-xs">?K</kbd>
          </button>
          <button
            onClick={onCreateEntity}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{currentView.type === 'wiki' ? 'New Page' : `New ${currentEntity.name}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
