import { Plus } from 'lucide-react';
import type { EntityDefinition, Entity, ViewConfig } from '../../types';
import { BoardViewMenu } from '../BoardViewMenu';

type WorkspaceHeaderProps = {
  currentView: ViewConfig;
  currentEntity: EntityDefinition;
  currentEntities: Entity[];
  onOpenCommandPalette: () => void;
  onCreateEntity: () => void;
  onOpenBoardConfig: () => void;
};

export function WorkspaceHeader({
  currentView,
  currentEntity,
  currentEntities,
  onOpenCommandPalette,
  onCreateEntity,
  onOpenBoardConfig,
}: WorkspaceHeaderProps) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{currentView.name}</h1>
          {currentView.type === 'board' && (
            <BoardViewMenu onConfigClick={onOpenBoardConfig} />
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

