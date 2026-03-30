import { X, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import type { ImportProvider } from '../../api/import';
import { useImportWizardFlow } from './useImportWizardFlow';
import { ImportWizardStepMapping } from './ImportWizardStepMapping';

interface ImportWizardProps {
  open: boolean;
  onClose: () => void;
  onImportComplete?: (projectId: string) => void;
}

export function ImportWizard({ open, onClose, onImportComplete }: ImportWizardProps) {
  const flow = useImportWizardFlow({ open, onClose, onImportComplete });

  const {
    step,
    setStep,
    provider,
    setProvider,
    baseUrl,
    setBaseUrl,
    email,
    setEmail,
    apiToken,
    setApiToken,
    selectedProject,
    metadata,
    mapping,
    setMapping,
    projectName,
    setProjectName,
    projectKey,
    setProjectKey,
    error,
    loading,
    importProgress,
    handleClose,
    handleVerify,
    handleProjectChange,
    handleSaveMapping,
    handleStartImport,
    canGoBack,
    goBack,
  } = flow;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            Import from {provider === 'jira' ? 'Jira (Cloud)' : 'Backlog'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-md text-red-200 text-sm">{error}</div>
          )}

          {step === 'provider' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ImportProvider)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white"
                >
                  <option value="jira">Jira (Cloud)</option>
                  <option value="backlog" disabled>Backlog (coming soon)</option>
                </select>
              </div>
              <p className="text-sm text-zinc-500">
                Connect to your {provider === 'jira' ? 'Jira Cloud' : 'Backlog'} instance to import tasks.
              </p>
            </div>
          )}

          {step === 'connection' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Base URL</label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-domain.atlassian.net"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">API Token</label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Your Jira API token"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
            </div>
          )}

          {step === 'metadata' && metadata && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Select project to import</label>
                <select
                  value={selectedProject?.id ?? ''}
                  onChange={(e) => {
                    const p = metadata.projects.find((x) => x.id === e.target.value);
                    handleProjectChange(p ?? null);
                  }}
                  disabled={loading}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white disabled:opacity-50"
                >
                  {metadata.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
              </div>
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Loading project fields and statuses…
                </p>
              ) : (
                <p className="text-sm text-zinc-500">
                  {metadata.fields.length} fields, {metadata.statuses.length} statuses available.
                </p>
              )}
            </div>
          )}

          {step === 'mapping' && metadata && (
            <ImportWizardStepMapping metadata={metadata} mapping={mapping} setMapping={setMapping} />
          )}

          {step === 'start' && selectedProject && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Rizm project name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={selectedProject.name}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Rizm project key (3-10 chars, A-Z0-9)</label>
                <input
                  type="text"
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                  placeholder={selectedProject.key}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-white placeholder-zinc-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
          <div>
            {canGoBack && (
              <button
                onClick={goBack}
                disabled={loading}
                className="flex items-center gap-1 text-zinc-400 hover:text-white disabled:opacity-50"
                type="button"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'provider' && (
              <button
                onClick={() => setStep('connection')}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md"
                type="button"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 'connection' && (
              <button
                onClick={handleVerify}
                disabled={loading || !baseUrl.trim() || !email.trim() || !apiToken.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md disabled:opacity-50"
                type="button"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Verify & fetch metadata
              </button>
            )}
            {step === 'metadata' && (
              <button
                onClick={() => setStep('mapping')}
                disabled={!selectedProject || loading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md disabled:opacity-50"
                type="button"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Next{' '}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 'mapping' && (
              <button
                onClick={handleSaveMapping}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md disabled:opacity-50"
                type="button"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Next
              </button>
            )}
            {step === 'start' && (
              <>
                {importProgress ? (
                  <div className="flex items-center gap-2 px-4 py-2 text-zinc-300">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>
                      Importing...
                      {importProgress.totalCount != null &&
                      importProgress.totalCount > 0 &&
                      importProgress.processedCount > 0
                        ? ` ${importProgress.processedCount}/${importProgress.totalCount} (${importProgress.percent}%)`
                        : ` ${importProgress.processedCount} issues loaded`}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={handleStartImport}
                    disabled={loading || !projectKey.trim() || projectKey.trim().length < 3}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-md disabled:opacity-50"
                    type="button"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Start import
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
