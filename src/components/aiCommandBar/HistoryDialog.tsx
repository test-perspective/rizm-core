import { useState } from 'react';
import { Eye, Trash2, X } from 'lucide-react';
import { isBackendEnabled } from '../../utils/storage';
import { fetchManifestVersion, ManifestVersionSummary } from './api';
import { ManifestViewDialog } from './ManifestViewDialog';

type HistoryDialogProps = {
  isOpen: boolean;
  projectId: string;
  versions: ManifestVersionSummary[];
  loadingVersions: boolean;
  revertingId: string | null;
  deletingId: string | null;
  onClose: () => void;
  onClearAll: () => void;
  onRevert: (versionId: string) => void;
  onDelete: (versionId: string) => void;
};

export const HistoryDialog = ({
  isOpen,
  projectId,
  versions,
  loadingVersions,
  revertingId,
  deletingId,
  onClose,
  onClearAll,
  onRevert,
  onDelete,
}: HistoryDialogProps) => {
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewJson, setViewJson] = useState('');
  const [viewTitle, setViewTitle] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleView = async (versionId: string) => {
    setViewOpen(true);
    setViewLoading(true);
    setViewError(null);
    setViewJson('');
    setViewTitle('');
    setViewingId(versionId);
    try {
      const detail = await fetchManifestVersion(projectId, versionId);
      setViewTitle(detail.manifest.name || 'Manifest');
      setViewJson(JSON.stringify(detail.manifest, null, 2));
    } catch (e) {
      console.error('[manifest] load version failed', e);
      setViewError('Failed to load manifest version.');
    } finally {
      setViewLoading(false);
      setViewingId(null);
    }
  };

  const handleCopy = async () => {
    if (!viewJson) return;
    try {
      await navigator.clipboard.writeText(viewJson);
    } catch (e) {
      console.error('[manifest] copy failed', e);
      setViewError('Failed to copy JSON.');
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Manifest History</h3>
            <p className="text-xs text-zinc-500 mt-1">Project: {projectId}</p>
          </div>
          <div className="flex items-center gap-2">
            {versions.length > 0 && (
              <button
                onClick={onClearAll}
                className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800/60 border border-red-700 rounded-md text-sm text-red-200 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All</span>
              </button>
            )}
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {!isBackendEnabled() && (
            <div className="mb-4 text-sm text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
              Backend is disabled (VITE_KEEL_BACKEND_URL).
            </div>
          )}

          {loadingVersions ? (
            <div className="text-sm text-zinc-300">Loading history...</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-zinc-400">No history available.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-2">
              {versions.map((v, index) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5">
                        {v.source === 'seed' ? 'Initial' : v.source}
                      </span>
                    </div>
                    {v.message ? (
                      <div className="text-xs text-zinc-500 mt-1 truncate">Instruction: {v.message}</div>
                    ) : (
                      <div className="text-xs text-zinc-500 mt-1 truncate">Instruction: (none)</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={!!revertingId || !!deletingId || viewingId === v.id}
                      onClick={() => handleView(v.id)}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      {viewingId === v.id ? (
                        <div className="w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      <span>View</span>
                    </button>
                    {index === 0 ? (
                      <span className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-300">
                        Current
                      </span>
                    ) : (
                      <button
                        disabled={!!revertingId || deletingId === v.id}
                        onClick={() => onRevert(v.id)}
                        className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
                      >
                        {revertingId === v.id ? 'Restoring...' : 'Restore'}
                      </button>
                    )}
                    <button
                      disabled={!!revertingId || deletingId === v.id}
                      onClick={() => onDelete(v.id)}
                      className="p-2 text-zinc-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Delete"
                    >
                      {deletingId === v.id ? (
                        <div className="w-4 h-4 border-2 border-zinc-400/30 border-t-zinc-400 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ManifestViewDialog
        isOpen={viewOpen}
        title={viewTitle}
        json={viewJson}
        isLoading={viewLoading}
        error={viewError}
        onClose={() => setViewOpen(false)}
        onCopy={handleCopy}
      />
    </div>
  );
};
