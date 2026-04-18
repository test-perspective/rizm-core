import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

/** REQ-288: notes pane actions next to Board/Table title */
export type ViewTitleNotesMenu = {
  show: boolean;
  wikiPagesCount: number;
  isNotePaneOpen: boolean;
  onOpenPicker: () => void;
  onHide: () => void;
};

interface BoardViewMenuProps {
  /** Board view: opens column settings. Omit on table-only menu. */
  onConfigClick?: () => void;
  /** REQ-288 wiki side pane */
  notes?: ViewTitleNotesMenu;
  menuButtonTestId?: string;
}

/**
 * Overflow menu next to the Board or Table view title (⋯).
 */
export function BoardViewMenu({
  onConfigClick,
  notes,
  menuButtonTestId = 'view-title-overflow-menu',
}: BoardViewMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasSettings = typeof onConfigClick === 'function';
  const hasNotes = notes?.show === true;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!hasSettings && !hasNotes) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
        type="button"
        aria-label="View menu"
        data-testid={menuButtonTestId}
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50">
          <div className="py-1">
            {hasSettings && (
              <button
                onClick={() => {
                  onConfigClick?.();
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
                type="button"
              >
                Settings
              </button>
            )}
            {hasNotes && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors disabled:opacity-40"
                  disabled={notes!.wikiPagesCount === 0}
                  onClick={() => {
                    notes!.onOpenPicker();
                    setIsOpen(false);
                  }}
                >
                  Open notes pane…
                </button>
                {notes!.isNotePaneOpen ? (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
                    onClick={() => {
                      notes!.onHide();
                      setIsOpen(false);
                    }}
                  >
                    Hide notes pane
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
