import { useAuth } from '../auth/AuthContext';
import { useMemo, useState, useRef, useEffect } from 'react';
import { NewProjectModal, type NewProjectType } from './sidebar/NewProjectModal';
import type { SidebarProps } from './sidebar/sidebarTypes';
import { isValidProjectKey, normalizeProjectKey } from './sidebar/sidebarUtils';
import { useProjectKeySuggestion } from './sidebar/useProjectKeySuggestion';
import { SidebarProjectSection } from './sidebar/SidebarProjectSection';
import { SidebarViewsSection } from './sidebar/SidebarViewsSection';
import { SidebarFooter } from './sidebar/SidebarFooter';

export const Sidebar = ({
  projects,
  activeProjectId,
  onProjectChange,
  onCreateProject,
  manifest,
  currentView,
  onViewChange,
  onOpenProjectDetail,
  onReorderViews,
}: SidebarProps) => {
  const { user } = useAuth();
  const canEdit = !!user && user.role !== 'viewer';
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Development');
  const [newProjectKey, setNewProjectKey] = useState('');
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [newProjectType, setNewProjectType] = useState<NewProjectType>('development');
  const [newProjectPrompt, setNewProjectPrompt] = useState('');
  const [newProjectPromptEnabled, setNewProjectPromptEnabled] = useState(false);
  const [keyAvailability, setKeyAvailability] = useState<'unknown' | 'available' | 'taken'>('unknown');
  const [keyAvailabilityChecking, setKeyAvailabilityChecking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { suggestProjectKey } = useProjectKeySuggestion(
    projects,
    newProjectOpen,
    newProjectName,
    newProjectKey,
    keyManuallyEdited,
    setNewProjectKey,
    setKeyAvailability,
    setKeyAvailabilityChecking
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const visibleViews = useMemo(
    () => manifest.views.filter((view) => view.type !== 'list'),
    [manifest.views]
  );

  const handleAddProject = () => {
    const name = 'Development';
    setNewProjectName(name);
    setKeyManuallyEdited(false);
    setKeyAvailability('unknown');
    setNewProjectType('development');
    setNewProjectPrompt('');
    setNewProjectPromptEnabled(false);
    setNewProjectOpen(true);
    setMenuOpen(false);
  };

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <SidebarProjectSection
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectChange={onProjectChange}
        onOpenProjectDetail={onOpenProjectDetail}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        menuRef={menuRef}
        onAddProject={handleAddProject}
      />

      <SidebarViewsSection
        visibleViews={visibleViews}
        currentView={currentView}
        canEdit={canEdit}
        onViewChange={onViewChange}
        onReorderViews={onReorderViews}
      />

      {user && <SidebarFooter user={user} />}

      <NewProjectModal
        isOpen={newProjectOpen}
        newProjectName={newProjectName}
        newProjectKey={newProjectKey}
        keyManuallyEdited={keyManuallyEdited}
        newProjectType={newProjectType}
        newProjectPrompt={newProjectPrompt}
        newProjectPromptEnabled={newProjectPromptEnabled}
        normalizeProjectKey={normalizeProjectKey}
        isValidProjectKey={isValidProjectKey}
        onSuggestProjectKey={suggestProjectKey}
        keyAvailability={keyAvailability}
        keyAvailabilityChecking={keyAvailabilityChecking}
        onClose={() => setNewProjectOpen(false)}
        onCreateProject={onCreateProject}
        setNewProjectName={setNewProjectName}
        setNewProjectKey={setNewProjectKey}
        setKeyManuallyEdited={setKeyManuallyEdited}
        setNewProjectType={setNewProjectType}
        setNewProjectPrompt={setNewProjectPrompt}
        setNewProjectPromptEnabled={setNewProjectPromptEnabled}
      />
    </div>
  );
};
