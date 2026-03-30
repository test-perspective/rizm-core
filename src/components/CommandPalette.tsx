import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { searchApi, type SearchResult } from '../api/search';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAICommand: () => void;
  onCreateEntity: () => void;
  activeProjectId: string;
  activeProjectKey: string;
  projectKeyById: Map<string, string>;
  onSelectResult: (result: SearchResult, query: string) => void;
}

export const CommandPalette = ({
  isOpen,
  onClose,
  onAICommand,
  onCreateEntity,
  activeProjectId,
  activeProjectKey,
  projectKeyById,
  onSelectResult,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'command' | 'search'>('command');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const formatScore = (distance: number) => {
    if (!Number.isFinite(distance)) return 'Score ?';
    const score = 1 / (1 + Math.max(0, distance));
    return `Score ${Math.round(score * 100)}%`;
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const mousedownTargetRef = useRef<EventTarget | null>(null);

  const parseSearchInput = useCallback((raw: string) => {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    let projectId: string | undefined;
    const remaining: string[] = [];
    let hasCommandToken = false;
    const commandTokens: string[] = [];
    for (const token of tokens) {
      if (token.startsWith('project:')) {
        const value = token.slice('project:'.length);
        if (value) {
          if (value === 'current') {
            projectId = activeProjectId;
          } else {
            const normalized = value.trim().toUpperCase();
            const matched = [...projectKeyById.entries()].find(
              ([, key]) => key.trim().toUpperCase() === normalized
            );
            projectId = matched?.[0];
          }
        }
        continue;
      }
      if (token.startsWith('command:')) {
        hasCommandToken = true;
        const value = token.slice('command:'.length).trim();
        if (value) {
          commandTokens.push(value);
        }
        continue;
      }
      if (hasCommandToken) {
        commandTokens.push(token);
        continue;
      }
      remaining.push(token);
    }
    const queryText = remaining.join(' ').trim();
    const hasProjectToken = tokens.some((token) => token.startsWith('project:'));
    return {
      queryText,
      scope: projectId || hasProjectToken ? 'project' : 'global',
      projectId,
      hasProjectToken,
      hasCommandToken,
      commandQuery: commandTokens.join(' ').trim(),
    } as const;
  }, [activeProjectId, projectKeyById]);

  const commands = [
    { id: 'new', label: 'Create new entity', icon: '➕', action: onCreateEntity },
    { id: 'ai', label: 'AI Transform...', icon: '✨', action: onAICommand },
  ];

  const parsedInput = useMemo(
    () => parseSearchInput(query),
    [parseSearchInput, query]
  );
  const commandFilter = parsedInput.hasCommandToken ? parsedInput.commandQuery : query;
  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(commandFilter.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMode('command');
      setResults([]);
      setIsSearching(false);
      return;
    }
    setQuery(`project:${activeProjectKey} `);
    setMode('search');
  }, [activeProjectKey, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const parsed = parsedInput;
    if (parsed.hasCommandToken) {
      setResults([]);
      setIsSearching(false);
      setMode('command');
      return;
    }
    if (!parsed.queryText) {
      setResults([]);
      setIsSearching(false);
      setMode(parsed.hasProjectToken ? 'search' : 'command');
      return;
    }
    if (mode !== 'search') {
      setMode('search');
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      setIsSearching(true);
      searchApi({
        query: parsed.queryText,
        scope: parsed.scope,
        projectId: parsed.projectId,
        types: ['task', 'page'],
        limit: 10,
      })
        .then((res) => {
          setResults(res);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [activeProjectId, isOpen, mode, parsedInput, query]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed === 'command' || trimmed === 'comm' || trimmed === 'cmd') {
      setQuery('command: ');
      setMode('command');
    }
  }, [isOpen, query]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      mousedownTargetRef.current = e.target;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && mousedownTargetRef.current === e.currentTarget) {
      onClose();
    }
    mousedownTargetRef.current = null;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
      data-testid="command-palette-backdrop"
      onClick={handleBackdropClick}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden"
        data-testid="command-palette-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className="w-5 h-5 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type command: or search..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="one-time-code"
          />
          <kbd className="px-2 py-1 text-xs bg-zinc-800 text-zinc-400 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {mode === 'command' ? (
            filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-500">No commands found</div>
            ) : (
              <div className="py-2">
                {filteredCommands.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      cmd.action();
                      if (cmd.id !== 'search-project') {
                        onClose();
                        setQuery('');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-left transition-colors"
                  >
                    <span className="text-xl">{cmd.icon}</span>
                    <span className="text-white">{cmd.label}</span>
                    {cmd.id === 'ai' && (
                      <Sparkles className="w-4 h-4 text-violet-400 ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            )
          ) : isSearching ? (
            <div className="px-4 py-8 text-center text-zinc-500">Searching...</div>
          ) : results.length === 0 && !parseSearchInput(query).queryText ? (
            <div className="px-4 py-8 text-center text-zinc-500">Type to search...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500">No results found</div>
          ) : (
            <div className="py-2">
              {results.map((res) => (
                <button
                  key={`${res.projectId}:${res.entityPk}`}
                  onClick={() => {
                    onSelectResult(res, parseSearchInput(query).queryText);
                    onClose();
                    setQuery(`project:${activeProjectKey} `);
                    setMode('command');
                  }}
                  className="w-full flex flex-col items-start gap-1 px-4 py-3 hover:bg-zinc-800 text-left transition-colors"
                >
                  <div className="w-full flex items-center gap-2 text-sm text-white">
                    {res.kind === 'task' ? (
                      <span className="font-mono text-zinc-400 shrink-0">
                        {res.taskKey ?? 'TASK'}
                      </span>
                    ) : null}
                    <span className="truncate">
                      {res.title || (res.kind === 'task' ? 'Untitled Task' : 'Untitled')}
                    </span>
                    <span className="ml-auto text-xs text-zinc-500">
                      {res.projectName} · {formatScore(res.distance)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 line-clamp-2">
                    {res.preview || 'No preview'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
