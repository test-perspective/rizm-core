import { useEffect, useState } from 'react';
import type { AiProvider, LlmConfig } from '../../utils/aiTransform';
import { getStoredLlmConfig, getStoredModelForProvider, setStoredLlmConfig } from '../../utils/aiTransform';
import { isAiFallbackForced, isBackendEnabled } from '../../utils/storage';

export type NewProjectType = 'development' | 'crm' | 'inventory' | 'book' | 'bug';

export type NewProjectInput = {
  name: string;
  projectKey: string;
  projectType: NewProjectType;
  usePrompt: boolean;
  prompt: string;
  llmConfig: LlmConfig;
};

type NewProjectModalProps = {
  isOpen: boolean;
  newProjectName: string;
  newProjectKey: string;
  keyManuallyEdited: boolean;
  newProjectType: NewProjectType;
  newProjectPrompt: string;
  newProjectPromptEnabled: boolean;
  normalizeProjectKey: (raw: string) => string;
  isValidProjectKey: (raw: string) => boolean;
  onSuggestProjectKey: (projectName: string) => Promise<void> | void;
  keyAvailability: 'unknown' | 'available' | 'taken';
  keyAvailabilityChecking: boolean;
  onClose: () => void;
  onCreateProject: (input: NewProjectInput) => Promise<void> | void;
  setNewProjectName: (next: string) => void;
  setNewProjectKey: (next: string) => void;
  setKeyManuallyEdited: (next: boolean) => void;
  setNewProjectType: (next: NewProjectType) => void;
  setNewProjectPrompt: (next: string) => void;
  setNewProjectPromptEnabled: (next: boolean) => void;
};

export function NewProjectModal({
  isOpen,
  newProjectName,
  newProjectKey,
  keyManuallyEdited,
  newProjectType,
  newProjectPrompt,
  newProjectPromptEnabled,
  normalizeProjectKey,
  isValidProjectKey,
  onSuggestProjectKey,
  keyAvailability,
  keyAvailabilityChecking,
  onClose,
  onCreateProject,
  setNewProjectName,
  setNewProjectKey,
  setKeyManuallyEdited,
  setNewProjectType,
  setNewProjectPrompt,
  setNewProjectPromptEnabled,
}: NewProjectModalProps) {
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(getStoredLlmConfig);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const presetsOnly = isAiFallbackForced();
  const backendReady = isBackendEnabled() && !presetsOnly;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    setStoredLlmConfig(llmConfig);
  }, [llmConfig]);

  const handleCreate = async () => {
    const name = newProjectName.trim() || 'Development';
    const key = normalizeProjectKey(newProjectKey);
    if (!name) {
      setError('Project name is required.');
      return;
    }
    if (!isValidProjectKey(key)) {
      setError('Invalid project key (3-10 characters, A-Z0-9).');
      return;
    }
    if (keyAvailability === 'taken') {
      setError('This key is already in use.');
      return;
    }
    if (isBackendEnabled() && keyAvailability !== 'available') {
      setError('Unable to verify project key availability.');
      return;
    }
    if (newProjectPromptEnabled) {
      if (!backendReady) {
        setError('Backend is required for prompt-based creation.');
        return;
      }
      if (!newProjectPrompt.trim()) {
        setError('Prompt is required when enabled.');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreateProject({
        name,
        projectKey: key,
        projectType: newProjectType,
        usePrompt: newProjectPromptEnabled,
        prompt: newProjectPrompt,
        llmConfig,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('canceled')) {
        setError(null);
        return;
      }
      setError(msg || 'Failed to create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl">
        <div className="px-5 py-4 border-b border-zinc-800">
        <div className="text-lg font-semibold text-white">New Project</div>
          <div className="text-xs text-zinc-500 mt-1">
            projectKey must be 3-10 characters (A-Z0-9) and unique.
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Project type</label>
            <select
              value={newProjectType}
              onChange={(e) => setNewProjectType(e.target.value as NewProjectType)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="development">Development (default)</option>
              <option value="crm">CRM</option>
              <option value="inventory">Inventory</option>
              <option value="book">Book Tracker</option>
              <option value="bug">Bug Tracker</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Name</label>
            <input
              value={newProjectName}
              onChange={(e) => {
                const v = e.target.value;
                setNewProjectName(v);
                // Auto-suggest key unless user has manually edited it
                if (!keyManuallyEdited) {
                  void onSuggestProjectKey(v);
                }
              }}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Project name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Key</label>
            <div className="flex gap-2">
              <input
                value={newProjectKey}
                onChange={(e) => {
                  setNewProjectKey(normalizeProjectKey(e.target.value));
                  setKeyManuallyEdited(true);
                }}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="ABC"
              />
              <button
                type="button"
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-sm text-zinc-200"
                onClick={() => {
                  setKeyManuallyEdited(false);
                  void onSuggestProjectKey(newProjectName);
                }}
                title="Suggest"
              >
                Suggest
              </button>
            </div>
            {newProjectKey && !isValidProjectKey(newProjectKey) ? (
              <div className="text-xs text-red-400 mt-2">
                Invalid key (must be 3-10 characters, A-Z0-9).
              </div>
            ) : keyAvailabilityChecking ? (
              <div className="text-xs text-zinc-400 mt-2">
                Checking availability...
              </div>
            ) : keyAvailability === 'taken' ? (
              <div className="text-xs text-red-400 mt-2">
                This key is already in use.
              </div>
            ) : isBackendEnabled() && keyAvailability === 'unknown' ? (
              <div className="text-xs text-amber-300 mt-2">
                Unable to verify key availability.
              </div>
            ) : null}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={newProjectPromptEnabled}
                onChange={(e) => setNewProjectPromptEnabled(e.target.checked)}
                className="accent-violet-500"
              />
              <span>Create from prompt</span>
            </label>
            <p className="text-xs text-zinc-500 mt-1">
              Requires backend. Generates the initial manifest from text.
            </p>
          </div>

          {newProjectPromptEnabled && (
            <div className="space-y-3">
              {!backendReady && (
                <div className="text-xs text-amber-200 bg-amber-950/40 border border-amber-900 rounded-md p-3">
                  Backend is required for prompt-based creation.
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Prompt</label>
                <textarea
                  value={newProjectPrompt}
                  onChange={(e) => setNewProjectPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="e.g., Create a project like Customer Support with a ticket backlog..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">LLM Provider</label>
                <select
                  value={llmConfig.provider}
                  onChange={(e) => {
                    const nextProvider = (e.target.value as AiProvider) || 'deepseek';
                    const model = getStoredModelForProvider(nextProvider);
                    setLlmConfig((c) => ({ ...c, provider: nextProvider, model: model || undefined }));
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="openrouter">Open Router</option>
                  <option value="deepseek">DeepSeek API</option>
                  <option value="ollama">Local (Ollama)</option>
                </select>
              </div>

              {llmConfig.provider === 'deepseek' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">DeepSeek API Key</label>
                  <input
                    type="password"
                    value={llmConfig.deepseekApiKey ?? ''}
                    onChange={(e) => setLlmConfig((c) => ({ ...c, deepseekApiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}

              {llmConfig.provider === 'openrouter' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Open Router API Key</label>
                  <input
                    type="password"
                    value={llmConfig.openrouterApiKey ?? ''}
                    onChange={(e) => setLlmConfig((c) => ({ ...c, openrouterApiKey: e.target.value }))}
                    placeholder="sk-or-..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-md p-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-sm text-zinc-200"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              !newProjectName.trim() ||
              !isValidProjectKey(newProjectKey) ||
              keyAvailabilityChecking ||
              keyAvailability === 'taken' ||
              (isBackendEnabled() && keyAvailability !== 'available') ||
              isSubmitting
            }
            onClick={handleCreate}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

