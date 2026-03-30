import { useState } from 'react';
import { X } from 'lucide-react';
import { isBackendEnabled, loadDataAsync } from '../../utils/storage';
import { buildBackupZip, downloadBlob, makeBackupZipFilename } from '../../utils/exportZip';

type ExportAllProjectsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ExportAllProjectsDialog({ open, onClose }: ExportAllProjectsDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportAllProjectsZip = async () => {
    setExporting(true);
    setStatus(null);
    try {
      if (!isBackendEnabled()) {
        throw new Error('Backend persistence is disabled (please set VITE_KEEL_BACKEND_URL)');
      }
      const data = await loadDataAsync();
      const zipBlob = await buildBackupZip(data);
      downloadBlob(zipBlob, makeBackupZipFilename());
      setStatus('Export started (ZIP downloaded).');
    } catch (e) {
      console.error(e);
      setStatus('Export failed. Please check backend persistence settings and login status.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Export All Projects (ZIP)</h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-zinc-400 mb-4">
            Download all project data as ZIP (CSV + JSON for restoration). <span className="font-mono">state.json</span>{' '}
            is the source of truth for restoration.
          </p>
          {status && (
            <div className="mb-4 text-sm text-zinc-200 bg-zinc-950/40 border border-zinc-800 rounded-md p-3">
              {status}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm"
            >
              Close
            </button>
            <button
              disabled={exporting}
              onClick={exportAllProjectsZip}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 rounded-md text-sm font-medium transition-colors"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
