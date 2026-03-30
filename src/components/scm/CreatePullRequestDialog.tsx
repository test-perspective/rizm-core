import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Entity } from '../../types';
import { createBitbucketPullRequest } from '../../api/scm';
import { getEntityTitle, getTaskKey } from '../../utils/scm';
import { BranchSelect } from './BranchSelect';
import { ScmBusyOverlay } from './ScmBusyOverlay';

type CreatePullRequestDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  entity: Entity;
  sourceBranch: string;
  onCreated: (payload: { id: string; title: string; url: string; destinationBranch: string }) => void | Promise<boolean | void>;
};

export function CreatePullRequestDialog({
  open,
  onClose,
  projectId,
  entity,
  sourceBranch,
  onCreated,
}: CreatePullRequestDialogProps) {
  const [destinationBranch, setDestinationBranch] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultTitle = useMemo(() => {
    const taskKey = getTaskKey(entity);
    const entityTitle = getEntityTitle(entity);
    return `${taskKey} ${entityTitle}`.trim();
  }, [entity]);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setDescription('');
  }, [open, defaultTitle]);

  useEffect(() => {
    if (!open) return;
    setDestinationBranch('');
  }, [open]);

  const handleCreate = async () => {
    if (!sourceBranch.trim() || !destinationBranch.trim() || !title.trim()) {
      setError('Source, destination, and title are required.');
      return;
    }
    if (sourceBranch.trim() === destinationBranch.trim()) {
      setError('Source and destination must be different.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await createBitbucketPullRequest(projectId, {
        sourceBranch: sourceBranch.trim(),
        destinationBranch: destinationBranch.trim(),
        title: title.trim(),
        description: description.trim() ? description.trim() : undefined,
      });
      const persisted = await onCreated({
        id: res.id,
        title: res.title,
        url: res.url,
        destinationBranch: destinationBranch.trim(),
      });
      if (persisted === false) {
        setError('Pull request was created, but failed to update the card. Please reload and try again.');
        return;
      }
      onClose();
    } catch (e) {
      console.error('Failed to create pull request:', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('There are no changes to be pulled')) {
        setError('There are no changes between branches. Push commits or choose a different destination branch.');
      } else {
        setError(`Failed to create pull request: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative bg-zinc-900 rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-bold text-white">Create Pull Request</h2>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-zinc-400 hover:text-white disabled:text-zinc-600"
            disabled={saving}
            aria-disabled={saving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-950/40 border border-red-900 rounded-md p-3">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Source Branch</label>
            <input
              type="text"
              value={sourceBranch}
              readOnly
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-400"
              disabled={saving}
            />
          </div>
          <BranchSelect
            projectId={projectId}
            value={destinationBranch}
            onChange={setDestinationBranch}
            disabled={saving}
            onLoadingChange={setLoadingBranches}
            excludeFromInitial={sourceBranch}
            label="Destination Branch"
          />
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="PROJ-123 Title"
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[80px]"
              placeholder="Describe the changes"
              disabled={saving}
            />
          </div>
        </div>

        <div className="p-4 border-t border-zinc-700 flex justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm text-zinc-200 transition-colors disabled:bg-zinc-900 disabled:text-zinc-600"
            type="button"
            disabled={saving}
            aria-disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCreate();
            }}
            disabled={saving || loadingBranches || !destinationBranch.trim()}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
            type="button"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
        <ScmBusyOverlay
          active={saving}
          message="Creating pull request in Bitbucket... This can take a few seconds."
        />
      </div>
    </div>,
    document.body
  );
}
