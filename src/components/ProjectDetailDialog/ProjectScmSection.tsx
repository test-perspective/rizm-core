import type { ScmRepoVerifyState } from './useProjectScmSettings';

interface ProjectScmSectionProps {
  scmWorkspace: string;
  scmRepoSlug: string;
  scmConnected: boolean;
  hasSavedRepoConfig: boolean;
  scmRepoVerify: ScmRepoVerifyState;
  scmRepoVerifyError: string | null;
  scmLoading: boolean;
  scmSaving: boolean;
  scmConnecting: boolean;
  scmError: string | null;
  onScmWorkspaceChange: (value: string) => void;
  onScmRepoSlugChange: (value: string) => void;
  onSaveScmConfig: () => Promise<void>;
  onConnectBitbucket: () => Promise<void>;
}

function scmStatusSummary(params: {
  accountLinked: boolean;
  hasSavedRepoConfig: boolean;
  repoVerify: ScmRepoVerifyState;
}): string {
  const { accountLinked, hasSavedRepoConfig, repoVerify } = params;
  if (!accountLinked && !hasSavedRepoConfig) {
    return 'Bitbucket account: not linked';
  }
  if (!accountLinked && hasSavedRepoConfig) {
    return 'Configuration saved — link Bitbucket to verify repository access';
  }
  if (accountLinked && !hasSavedRepoConfig) {
    return 'Bitbucket account: linked — enter workspace and repo, then Save Config';
  }
  if (repoVerify === 'checking') {
    return 'Checking repository access…';
  }
  if (repoVerify === 'ok') {
    return 'Bitbucket account: linked — repository reachable';
  }
  if (repoVerify === 'error') {
    return 'Bitbucket account: linked — repository not reachable';
  }
  return 'Bitbucket account: linked — saved configuration';
}

export function ProjectScmSection({
  scmWorkspace,
  scmRepoSlug,
  scmConnected,
  hasSavedRepoConfig,
  scmRepoVerify,
  scmRepoVerifyError,
  scmLoading,
  scmSaving,
  scmConnecting,
  scmError,
  onScmWorkspaceChange,
  onScmRepoSlugChange,
  onSaveScmConfig,
  onConnectBitbucket,
}: ProjectScmSectionProps) {
  const connectButtonLabel =
    scmConnected && hasSavedRepoConfig ? 'Reconnect Bitbucket' : 'Connect Bitbucket';

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">SCM Integration (Bitbucket)</h3>
      {scmError && (
        <div className="bg-red-950/40 border border-red-900 rounded-md p-3 mb-3">
          <p className="text-sm text-red-200">{scmError}</p>
        </div>
      )}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Workspace</label>
          <input
            type="text"
            value={scmWorkspace}
            onChange={(e) => onScmWorkspaceChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="your-workspace"
            disabled={scmLoading || scmSaving || scmConnecting}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Repo Slug</label>
          <input
            type="text"
            value={scmRepoSlug}
            onChange={(e) => onScmRepoSlugChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="your-repo"
            disabled={scmLoading || scmSaving || scmConnecting}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void onSaveScmConfig()}
            disabled={scmSaving || scmLoading || scmConnecting}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-md text-sm font-medium transition-colors"
          >
            {scmSaving ? 'Saving...' : 'Save Config'}
          </button>
          <button
            onClick={() => void onConnectBitbucket()}
            disabled={scmLoading || scmConnecting}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm text-zinc-200 transition-colors"
          >
            {scmConnecting ? 'Connecting...' : connectButtonLabel}
          </button>
        </div>
        <p className="text-xs text-zinc-500 leading-snug">
          {scmStatusSummary({
            accountLinked: scmConnected,
            hasSavedRepoConfig,
            repoVerify: scmRepoVerify,
          })}
        </p>
        {scmRepoVerify === 'error' && scmRepoVerifyError && (
          <div className="rounded-md border border-amber-900/80 bg-amber-950/35 px-3 py-2">
            <p className="text-xs text-amber-100/95">{scmRepoVerifyError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
