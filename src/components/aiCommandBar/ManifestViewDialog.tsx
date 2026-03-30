import Editor from '@monaco-editor/react';
import { Copy, X } from 'lucide-react';

type ManifestViewDialogProps = {
  isOpen: boolean;
  title: string;
  json: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onCopy: () => void;
};

export const ManifestViewDialog = ({
  isOpen,
  title,
  json,
  isLoading,
  error,
  onClose,
  onCopy,
}: ManifestViewDialogProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{title || 'Manifest'}</h3>
            <p className="text-xs text-zinc-500 mt-1">Read-only manifest snapshot</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCopy}
              disabled={!json || isLoading}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500 rounded-md text-sm text-zinc-200 transition-colors flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              <span>Copy JSON</span>
            </button>
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-sm text-zinc-300">Loading manifest...</div>
          ) : error ? (
            <div className="text-sm text-red-200 bg-red-950/40 border border-red-900 rounded-md p-3">
              {error}
            </div>
          ) : (
            <div className="border border-zinc-700 rounded-lg overflow-hidden" style={{ height: '60vh' }}>
              <Editor
                height="60vh"
                defaultLanguage="json"
                theme="vs-dark"
                value={json}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  folding: true,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  tabSize: 2,
                  readOnly: true,
                  automaticLayout: true,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
