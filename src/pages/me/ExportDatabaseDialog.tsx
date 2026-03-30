import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../auth/api';
import { isBackendEnabled } from '../../utils/storage';
import { downloadBlob } from '../../utils/exportZip';

type ExportDatabaseDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ExportDatabaseDialog({ open, onClose }: ExportDatabaseDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportDatabaseZip = async () => {
    setExporting(true);
    setStatus(null);
    try {
      if (!isBackendEnabled()) {
        throw new Error('Backend persistence is disabled (please set VITE_KEEL_BACKEND_URL)');
      }
      const res = await apiFetch('/api/admin/export-db', { method: 'GET' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition');
      let filename = 'keel-db.zip';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      downloadBlob(blob, filename);
      setStatus('Database export started (ZIP downloaded).');
    } catch (e) {
      console.error(e);
      setStatus('Failed to export database.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Export Database (ZIP)</h3>
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
            Download SQLite database file as ZIP. Can be used for backup or migration.
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
              onClick={exportDatabaseZip}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 rounded-md text-sm font-medium transition-colors"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
