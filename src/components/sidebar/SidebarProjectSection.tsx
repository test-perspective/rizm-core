import type { ProjectMeta } from '../../types';
import { ProjectOverflowMenu } from './ProjectOverflowMenu';
import { useIsMobile } from '../../hooks/useIsMobile';

interface SidebarProjectSectionProps {
  projects: ProjectMeta[];
  activeProjectId: string;
  onProjectChange: (projectId: string) => void;
  onOpenProjectDetail?: () => void;
  onAddProject: () => void;
}

export function SidebarProjectSection({
  projects,
  activeProjectId,
  onProjectChange,
  onOpenProjectDetail,
  onAddProject,
}: SidebarProjectSectionProps) {
  const isMobile = useIsMobile();
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
          {/* REQ-286: Project Details / Add Project are desktop-only — mobile keeps just the picker. */}
          {!isMobile && (
            <ProjectOverflowMenu
              onOpenProjectDetail={onOpenProjectDetail}
              onAddProject={onAddProject}
              menuButtonTestId="sidebar-project-overflow-menu"
            />
          )}
        </div>
      </div>
    </div>
  );
}
