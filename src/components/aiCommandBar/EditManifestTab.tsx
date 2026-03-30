import Editor from '@monaco-editor/react';
import { FileCode } from 'lucide-react';

type EditManifestTabProps = {
  manifestJson: string;
  manifestError: string | null;
  isSaving: boolean;
  onEditorChange: (value: string | undefined) => void;
  onSave: () => void;
};

export const EditManifestTab = ({
  manifestJson,
  manifestError,
  isSaving,
  onEditorChange,
  onSave,
}: EditManifestTabProps) => {
  return (
    <>
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-300 mb-2">Manifest JSON</label>
        <div className="border border-zinc-700 rounded-lg overflow-hidden" style={{ height: '500px' }}>
          <Editor
            height="500px"
            defaultLanguage="json"
            theme="vs-dark"
            value={manifestJson}
            onChange={onEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              folding: true,
              formatOnPaste: true,
              formatOnType: true,
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        </div>
        {manifestError && (
          <div className="mt-3 p-3 bg-red-950/40 border border-red-900 rounded-md">
            <p className="text-sm text-red-200">{manifestError}</p>
          </div>
        )}
      </div>
      <button
        onClick={onSave}
        disabled={isSaving || !!manifestError}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg font-medium hover:from-violet-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isSaving ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <FileCode className="w-5 h-5" />
            <span>Save Manifest</span>
          </>
        )}
      </button>
    </>
  );
};
