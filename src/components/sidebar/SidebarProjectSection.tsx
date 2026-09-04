import type { ProjectMeta } from '../../types';
import { ProjectOverflowMenu } from './ProjectOverflowMenu';
import { ProjectSelect } from '../common/ProjectSelect';
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
          {/* REQ-312: プロジェクトが多数でも探せるよう入力補完付きの選択に変更。 */}
          <ProjectSelect
            projects={projects}
            value={activeProjectId}
            onChange={onProjectChange}
            className="flex-1 min-w-0"
            testId="sidebar-project-select"
          />
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
