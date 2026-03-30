import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { apiFetch, apiJson } from '../../auth/api';

type DashboardPolicyDialogProps = {
  open: boolean;
  onClose: () => void;
  user: { role: string } | null;
};

export function DashboardPolicyDialog({ open, onClose, user }: DashboardPolicyDialogProps) {
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyJson, setPolicyJson] = useState<string>('');
  const [policyStatus, setPolicyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setPolicyLoading(true);
      setPolicyStatus(null);
      try {
        const res = await apiJson<{ policyJson: string }>('/api/me/dashboard-policy');
        if (!cancelled) setPolicyJson(res.policyJson ?? '');
      } catch (e) {
        console.error(e);
        if (!cancelled) setPolicyStatus('Failed to load dashboard policy.');
      } finally {
        if (!cancelled) setPolicyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const saveDashboardPolicy = async () => {
    setPolicySaving(true);
    setPolicyStatus(null);
    try {
      const raw = policyJson.trim();
      if (!raw) throw new Error('empty');
      JSON.parse(raw);

      const res = await apiFetch('/api/me/dashboard-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyJson: raw }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }
      const next = await apiJson<{ policyJson: string }>('/api/me/dashboard-policy');
      setPolicyJson(next.policyJson ?? raw);
      setPolicyStatus('Saved successfully.');
    } catch (e) {
      console.error(e);
      setPolicyStatus('Failed to save. Please check JSON format and login status.');
    } finally {
      setPolicySaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold text-white">Dashboard Policy</h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-zinc-400 mb-4">
            Define how to project and display Activity Log in JSON format. After saving, it will be reflected on{' '}
            <span className="font-mono">/dashboard</span>.
          </p>
          {policyStatus && (
            <div className="mb-4 text-sm text-zinc-200 bg-zinc-950/40 border border-zinc-800 rounded-md p-3">
              {policyStatus}
            </div>
          )}
          <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
            <Editor
              height="320px"
              defaultLanguage="json"
              theme="vs-dark"
              value={policyJson}
              onChange={(v) => setPolicyJson(v ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                tabSize: 2,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: policyLoading,
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={policyLoading || policySaving}
              onClick={saveDashboardPolicy}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 rounded-md text-sm font-medium transition-colors"
            >
              {policySaving ? 'Saving...' : 'Save'}
            </button>
            {policyLoading && <span className="text-xs text-zinc-500">Loading...</span>}
            <Link className="text-sm text-zinc-300 hover:text-white" to="/dashboard">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
