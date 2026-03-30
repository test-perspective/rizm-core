import { MoreVertical } from 'lucide-react';
import type { SidebarProps } from './sidebarTypes';

interface SidebarProjectSectionProps extends Pick<SidebarProps, 'projects' | 'activeProjectId' | 'onProjectChange' | 'onOpenProjectDetail'> {
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement>;
  onAddProject: () => void;
}

export function SidebarProjectSection({
  projects,
  activeProjectId,
  onProjectChange,
  onOpenProjectDetail,
  menuOpen,
  setMenuOpen,
  menuRef,
  onAddProject,
}: SidebarProjectSectionProps) {
  return (
    <div className="p-4 border-b border-zinc-800">
      <div className="flex items-center gap-2">
        <img src="/brand/logo.png" alt="Rizm" className="h-6" />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Project
          </span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={activeProjectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 text-white text-sm rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-600"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.projectKey ? ` (${p.projectKey})` : ''}
              </option>
            ))}
          </select>
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors"
              title="Project menu"
              type="button"
            >
              <MoreVertical className="w-4 h-4 text-zinc-200" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  {onOpenProjectDetail && (
                    <button
                      onClick={() => {
                        onOpenProjectDetail();
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
                      type="button"
                    >
                      Project Details
                    </button>
                  )}
                  <button
                    onClick={onAddProject}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
                    type="button"
                  >
                    Add Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
