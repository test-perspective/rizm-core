import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

type ProjectOverflowMenuProps = {
  onOpenProjectDetail?: () => void;
  onAddProject: () => void;
  /** Optional stable id for tests */
  menuButtonTestId?: string;
  /**
   * Where to anchor the dropdown relative to the trigger.
   * Use "start" when the trigger is near the left edge (e.g. notes chrome row) so the panel opens rightward.
   */
  dropdownPanelAlign?: 'start' | 'end';
};

/**
 * Project row "⋯" menu: details and add project.
 */
export function ProjectOverflowMenu({
  onOpenProjectDetail,
  onAddProject,
  menuButtonTestId = 'project-overflow-menu-trigger',
  dropdownPanelAlign = 'end',
}: ProjectOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        data-testid={menuButtonTestId}
        onClick={() => setOpen(!open)}
        className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors"
        title="Project menu"
        aria-label="Project menu"
      >
        <MoreVertical className="w-4 h-4 text-zinc-200" />
      </button>
      {open && (
        <div
          className={`absolute mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-[60] ${
            dropdownPanelAlign === 'start' ? 'left-0' : 'right-0'
          }`}
        >
          <div className="py-1">
            {onOpenProjectDetail && (
              <button
                type="button"
                onClick={() => {
                  onOpenProjectDetail();
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
              >
                Project Details
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onAddProject();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
            >
              Add Project
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
