import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { ProjectMeta } from '../../types';
import { saveProjectState } from '../../api/projects';
import type { Project } from '../../types';
import { useAppDialog } from '../dialogs';
import { ProjectInfoSection } from './ProjectInfoSection';
import { ProjectNameSection } from './ProjectNameSection';
import { ProjectActionsSection } from './ProjectActionsSection';
import { ProjectScmSection } from './ProjectScmSection';
import { useProjectScmSettings } from './useProjectScmSettings';

interface ProjectDetailDialogProps {
  project: Project | null;
  projectMeta: ProjectMeta | null;
  open: boolean;
  onClose: () => void;
  onRename?: (name: string) => Promise<void>;
  onDelete?: (projectId: string) => Promise<void>;
  onAICommand?: () => void;
  onOpenPolicy?: () => void;
  scmIntegrationEnabled?: boolean;
}

export function ProjectDetailDialog({
  project,
  projectMeta,
  open,
  onClose,
  onRename,
  onDelete,
  onAICommand,
  onOpenPolicy,
  scmIntegrationEnabled = false,
}: ProjectDetailDialogProps) {
  const dialog = useAppDialog();
  const { user } = useAuth();
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedProjectName, setLastSavedProjectName] = useState('');

  const scm = useProjectScmSettings(project, open, scmIntegrationEnabled);

  useEffect(() => {
    if (open && project) {
      setProjectName(project.name);
      setLastSavedProjectName(project.name);
      setError(null);
    }
  }, [open, project]);

  const projectNameDirty =
    open && project ? projectName.trim() !== lastSavedProjectName : false;
  const scmDirty =
    open &&
    (scm.scmWorkspace.trim() !== scm.lastSavedScmWorkspace ||
      scm.scmRepoSlug.trim() !== scm.lastSavedScmRepoSlug);
  const hasDirty = projectNameDirty || scmDirty;

  const requestClose = useCallback(async () => {
    if (hasDirty) {
      const confirmed = await dialog.confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Discard and close?',
        confirmText: 'Discard and close',
        cancelText: 'Keep editing',
        danger: true,
      });
      if (!confirmed) return;
    }
    onClose();
  }, [dialog, hasDirty, onClose]);

  useEffect(() => {
    if (!open || !project || !projectMeta) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      void requestClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, project?.id, projectMeta?.id, requestClose]);

  if (!open || !project || !projectMeta) return null;

  const isAdmin = user?.role === 'admin';

  const handleSaveName = async () => {
    if (!projectName.trim() || projectName.trim() === project.name) return;
    setSaving(true);
    setError(null);
    try {
      const name = projectName.trim();
      if (onRename) {
        await onRename(name);
      } else {
        const updatedProject: Project = {
          ...project,
          name,
          updatedAt: Date.now(),
        };
        await saveProjectState(updatedProject);
      }
      setLastSavedProjectName(name);
    } catch (e) {
      console.error('Failed to rename project:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to rename: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !onDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Project',
      message: `Are you sure you want to delete project "${project.name}"?\n\nThis action cannot be undone. All data in this project will be deleted.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(project.id);
      onClose();
    } catch (e) {
      console.error('Failed to delete project:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to delete: ${msg}`);
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="presentation"
    >
      <div className="bg-zinc-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-xl font-bold text-white">Project Details</h2>
          <button onClick={() => void requestClose()} className="text-zinc-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <div className="bg-red-950/40 border border-red-900 rounded-md p-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <ProjectInfoSection project={project} />

          <ProjectNameSection
            projectName={projectName}
            saving={saving}
            projectNameTrimmed={projectName.trim()}
            lastSavedName={lastSavedProjectName}
            onProjectNameChange={setProjectName}
            onSave={handleSaveName}
          />

          <ProjectActionsSection
            isAdmin={isAdmin}
            onAICommand={onAICommand}
            onOpenPolicy={onOpenPolicy}
            onDelete={handleDelete}
            deleting={deleting}
          />

          {scmIntegrationEnabled && (
            <ProjectScmSection
              scmWorkspace={scm.scmWorkspace}
              scmRepoSlug={scm.scmRepoSlug}
              scmConnected={scm.scmConnected}
              hasSavedRepoConfig={scm.hasSavedRepoConfig}
              scmRepoVerify={scm.scmRepoVerify}
              scmRepoVerifyError={scm.scmRepoVerifyError}
              scmLoading={scm.scmLoading}
              scmSaving={scm.scmSaving}
              scmConnecting={scm.scmConnecting}
              scmError={scm.scmError}
              onScmWorkspaceChange={scm.setScmWorkspace}
              onScmRepoSlugChange={scm.setScmRepoSlug}
              onSaveScmConfig={scm.handleSaveScmConfig}
              onConnectBitbucket={scm.handleConnectBitbucket}
            />
          )}
        </div>
      </div>
    </div>
  );
}
