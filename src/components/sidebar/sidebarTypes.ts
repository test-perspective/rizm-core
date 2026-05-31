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
  /** REQ-288: when true, only NewProjectModal is rendered (sidebar column hidden). */
  notesPaneOccluding?: boolean;
  /** REQ-286: when supplied (mobile drawer), called after the user picks a project/view to dismiss the drawer. */
  onAfterNavigate?: () => void;
}
