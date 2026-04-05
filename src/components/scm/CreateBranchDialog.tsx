import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, X } from 'lucide-react';
import type { Entity, ScmProjectConfig } from '../../types';
import { createBitbucketBranch } from '../../api/scm';
import {
  buildBranchName,
  type BranchPrefix,
  getEntityTitle,
  getTaskKey,
  sanitizeBranchName,
} from '../../utils/scm';
import { BranchSelect } from './BranchSelect';
import { ScmBusyOverlay } from './ScmBusyOverlay';

function buildGitCommands(
  branchName: string
): { bash: string; powershell: string; cmd: string } {
  const bash = `git fetch origin && \\
git checkout -b ${branchName} --track origin/${branchName}`;
  const powershell = `git fetch origin
git checkout -b ${branchName} --track origin/${branchName}`;
  const cmd = `git fetch origin ^
&& git checkout -b ${branchName} --track origin/${branchName}`;
  return { bash, powershell, cmd };
}

const PREFIX_OPTIONS: { value: BranchPrefix; label: string }[] = [
  { value: 'bugfix', label: 'bugfix' },
  { value: 'feature', label: 'feature' },
  { value: 'hotfix', label: 'hotfix' },
  { value: 'release', label: 'release' },
  { value: 'other', label: 'other' },
  { value: 'none', label: 'none' },
];

type CreateBranchDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  entity: Entity;
  scmConfig: ScmProjectConfig | null;
  onCreated: (payload: { name: string; url: string }) => void | Promise<boolean | void>;
};

export function CreateBranchDialog({
  open,
  onClose,
  projectId,
  entity,
  scmConfig,
  onCreated,
}: CreateBranchDialogProps) {
  const [prefix, setPrefix] = useState<BranchPrefix>('feature');
  const [baseBranch, setBaseBranch] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; url: string; baseBranch: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const taskKey = getTaskKey(entity);
  const title = getEntityTitle(entity);

  const suggestedName = useMemo(() => {
    const raw = buildBranchName(prefix, taskKey, title);
    return sanitizeBranchName(raw);
  }, [prefix, taskKey, title]);

  useEffect(() => {
    if (!open) return;
    setPrefix('feature');
    setBaseBranch('');
    setNameTouched(false);
    setBranchName(suggestedName);
    setCreated(null);
    setError(null);
    setCopied(null);
  }, [open, suggestedName]);

  useEffect(() => {
    if (!open) return;
    if (!nameTouched) {
      setBranchName(suggestedName);
    }
  }, [nameTouched, suggestedName, open]);


  const handleCreate = async () => {
    if (!scmConfig) {
      setError('Bitbucket repo is not configured.');
      return;
    }
    const sanitized = sanitizeBranchName(branchName);
    const bitbucketName = sanitized.replace(/\s+/g, '-');
    if (!bitbucketName || !baseBranch.trim()) {
      setError('Branch name and base branch are required.');
      return;
    }
    if (bitbucketName !== branchName.trim()) {
      setBranchName(bitbucketName);
    }
    setSaving(true);
    setError(null);
    try {
      const res = await createBitbucketBranch(projectId, bitbucketName, baseBranch.trim());
      const persisted = await onCreated(res);
      if (persisted === false) {
        setError(
          'The branch was created in Bitbucket, but updating the card failed. Please reload and try again.'
        );
        return;
      }
      setCreated({ name: res.name, url: res.url, baseBranch: baseBranch.trim() });
    } catch (e) {
      console.error('Failed to create branch:', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to create branch: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  const commands = created ? buildGitCommands(created.name) : null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative bg-zinc-900 rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-bold text-white">Create Branch</h2>
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
          {created ? (
            <>
              <div className="rounded-md bg-green-950/40 border border-green-900 p-3">
                <p className="text-sm font-medium text-green-200">Branch created.</p>
                <p className="text-xs text-zinc-400 mt-1">Branch: {created.name}</p>
                {created.url && (
                  <a
                    href={created.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 underline mt-1 block truncate"
                  >
                    {created.url}
                  </a>
                )}
              </div>
              <p className="text-sm font-medium text-zinc-400">Run locally to checkout:</p>
              {commands && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">Bash / Zsh</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(commands.bash, 'bash')}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-zinc-400 hover:text-white rounded transition-colors"
                      >
                        {copied === 'bash' ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copied === 'bash' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-700 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                      {commands.bash}
                    </pre>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">PowerShell</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(commands.powershell, 'powershell')}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-zinc-400 hover:text-white rounded transition-colors"
                      >
                        {copied === 'powershell' ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copied === 'powershell' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-700 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                      {commands.powershell}
                    </pre>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">cmd.exe</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(commands.cmd, 'cmd')}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-zinc-400 hover:text-white rounded transition-colors"
                      >
                        {copied === 'cmd' ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copied === 'cmd' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-700 rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                      {commands.cmd}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
          <BranchSelect
            projectId={projectId}
            value={baseBranch}
            onChange={setBaseBranch}
            disabled={saving}
            onLoadingChange={setLoadingBranches}
            label="Base Branch"
          />
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Prefix</label>
            <select
              value={prefix}
              onChange={(e) => setPrefix(e.target.value as BranchPrefix)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              disabled={saving}
            >
              {PREFIX_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Branch Name</label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setNameTouched(true);
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="feature/PROJ-123 Title"
              disabled={saving}
            />
            <p className="text-xs text-zinc-500 mt-1">Spaces are converted to “-” for Bitbucket.</p>
          </div>
            </>
          )}
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
            {created ? 'Close' : 'Cancel'}
          </button>
          {!created && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCreate();
              }}
              disabled={saving || loadingBranches || !baseBranch.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
              type="button"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          )}
        </div>
        <ScmBusyOverlay
          active={saving}
          message="Creating branch in Bitbucket... This can take a few seconds."
        />
      </div>
    </div>,
    document.body
  );
}
