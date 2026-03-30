import type { ProjectManifest, ProjectMeta } from '../../types';
import type { NewProjectInput } from './NewProjectModal';

export interface SidebarProps {
  projects: ProjectMeta[];
  activeProjectId: string;
  onProjectChange: (projectId: string) => void;
  onCreateProject: (input: NewProjectInput) => Promise<void> | void;
  manifest: ProjectManifest;
  currentView: string;
  onViewChange: (viewId: string) => void;
  onOpenProjectDetail?: () => void;
  onReorderViews?: (orderedViewIds: string[]) => void;
}
