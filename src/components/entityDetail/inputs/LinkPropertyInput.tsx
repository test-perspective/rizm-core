import { useMemo, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Entity } from '../../../types';
import { buildLinkedEntities, filterLinkableEntities, normalizeTaskKeys } from './linkUtils';

type LinkPropertyInputProps = {
  value: unknown;
  entities: Entity[];
  currentEntityId: string;
  onEntityClick?: (entity: Entity) => void;
  onChange: (nextValue: string[]) => void;
};

export const LinkPropertyInput = ({
  value,
  entities,
  currentEntityId,
  onEntityClick,
  onChange,
}: LinkPropertyInputProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const taskKeys = useMemo(() => normalizeTaskKeys(value), [value]);
  const linkedEntities = useMemo(() => buildLinkedEntities(taskKeys, entities), [taskKeys, entities]);
  const filteredEntities = useMemo(
    () => filterLinkableEntities(entities, currentEntityId, searchQuery),
    [searchQuery, entities, currentEntityId]
  );

  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = (selectedEntity: Entity) => {
    const tk = typeof selectedEntity.properties?.taskKey === 'string' ? selectedEntity.properties.taskKey.trim() : '';
    if (tk && !taskKeys.includes(tk)) {
      onChange([...taskKeys, tk]);
    }
    setSearchQuery('');
  };

  const handleRemove = (taskKeyToRemove: string) => {
    onChange(taskKeys.filter((tk) => tk !== taskKeyToRemove));
  };

  const handleClickLinked = (e: React.MouseEvent, entity: Entity | null | undefined) => {
    e.preventDefault();
    if (entity && onEntityClick) {
      onEntityClick(entity);
    }
  };

  return (
    <div className="space-y-2">
      {linkedEntities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {linkedEntities.map(({ taskKey, entity }) => (
            <div
              key={taskKey}
              className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1"
            >
              <button
                type="button"
                onClick={(e) => handleClickLinked(e, entity)}
                className={`text-xs font-mono ${
                  entity
                    ? 'text-violet-400 hover:text-violet-300 hover:underline cursor-pointer'
                    : 'text-zinc-500 line-through cursor-default'
                }`}
                title={entity ? `Click to open: ${taskKey}` : `Deleted entity: ${taskKey}`}
              >
                {taskKey}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(taskKey)}
                className="text-zinc-500 hover:text-red-400 transition-colors"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-left flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          <span>Add entity...</span>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-md shadow-lg max-h-64 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-zinc-800">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by task key or title..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredEntities.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500 text-center">No entities found</div>
              ) : (
                filteredEntities
                  .filter((e) => {
                    const tk = typeof e.properties?.taskKey === 'string' ? e.properties.taskKey.trim() : '';
                    return tk && !taskKeys.includes(tk);
                  })
                  .map((e) => {
                    const tk = typeof e.properties?.taskKey === 'string' ? e.properties.taskKey.trim() : '';
                    const title = typeof e.properties?.title === 'string' ? String(e.properties.title).trim() : '';
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => handleSelect(e)}
                        className="w-full px-3 py-2 text-left hover:bg-zinc-900 transition-colors border-b border-zinc-800 last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300 font-mono text-xs">{tk || '—'}</span>
                          {title && (
                            <>
                              <span className="text-zinc-600">·</span>
                              <span className="text-white text-sm truncate">{title}</span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })
              )}
            </div>
            <div className="p-2 border-t border-zinc-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className="px-3 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Close
              </button>
              <span className="text-xs text-zinc-600">
                {
                  filteredEntities.filter((e) => {
                    const tk = typeof e.properties?.taskKey === 'string' ? e.properties.taskKey.trim() : '';
                    return tk && !taskKeys.includes(tk);
                  }).length
                }{' '}
                shown
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
