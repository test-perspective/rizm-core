import { useState } from 'react';
import { History, Settings, Sparkles, X, FileCode } from 'lucide-react';
import { isBackendEnabled } from '../utils/storage';
import { predefinedTransformations } from '../utils/aiTransform';
import { TransformTab } from './aiCommandBar/TransformTab';
import { EditManifestTab } from './aiCommandBar/EditManifestTab';
import { HistoryDialog } from './aiCommandBar/HistoryDialog';
import { AiProgressDialog } from './aiCommandBar/AiProgressDialog';
import { LlmSettingsDialog } from './aiCommandBar/LlmSettingsDialog';
import { useAiCommandBarModel } from './aiCommandBar/useAiCommandBarModel';
import type { AICommandBarProps } from './aiCommandBar/aiCommandBarTypes';

export const AICommandBar = ({
  isOpen,
  onClose,
  onTransform,
  projectId,
  onReload,
  currentManifest,
}: AICommandBarProps) => {
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);
  const model = useAiCommandBarModel({
    isOpen,
    projectId,
    onReload,
    currentManifest,
    onClose,
    onTransform,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-violet-500/30 rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600/20 to-purple-600/20 px-6 py-4 border-b border-violet-500/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-violet-400" />
              <h2 className="text-xl font-bold text-white">AI Tools</h2>
            </div>
            <div className="flex items-center gap-2">
              {isBackendEnabled() && !model.presetsOnly && (
                <button
                  onClick={() => setLlmSettingsOpen(true)}
                  disabled={model.isProcessing}
                  className="px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 border border-zinc-700 rounded-md text-sm text-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Settings className="w-4 h-4" />
                  <span>LLM Settings</span>
                </button>
              )}
              <button
                onClick={() => model.setHistoryOpen(true)}
                className="px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 border border-zinc-700 rounded-md text-sm text-zinc-200 transition-colors flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
              <button
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            Manifest: <span className="text-violet-400 font-medium">{currentManifest.name}</span>
            {' · '}
            Model: <span className="text-violet-400 font-medium">{model.llmDisplayLabel}</span>
          </p>
          {model.presetsOnly && (
            <p className="text-xs text-amber-200 mt-1">
              Presets-only mode: LLM transform is disabled (VITE_KEEL_AI_FORCE_FALLBACK=true)
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/50">
          <button
            onClick={() => model.setActiveTab('transform')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              model.activeTab === 'transform'
                ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-500/10'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Transform</span>
          </button>
          <button
            onClick={() => model.setActiveTab('edit')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              model.activeTab === 'edit'
                ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-500/10'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Edit Manifest</span>
          </button>
        </div>

        <div className="p-6">
          {model.activeTab === 'transform' ? (
            <TransformTab
              inputRef={model.inputRef}
              input={model.input}
              onInputChange={model.setInput}
              onSendMessage={model.handleSendMessage}
              onGenerateManifest={model.handleGenerateManifest}
              isProcessing={model.isProcessing}
              presetsOnly={model.presetsOnly}
              quickTransformKeys={Object.keys(predefinedTransformations)}
              onQuickTransform={(key) => {
                if (model.presetsOnly) {
                  const m = predefinedTransformations[key as keyof typeof predefinedTransformations]();
                  onTransform(m, { source: 'ai_transform', message: `Transform to ${key}` });
                  model.setInput('');
                  onClose();
                  return;
                }
                model.setInput(`Transform to ${key}`);
              }}
              history={model.transformHistory}
              onClearHistory={model.handleClearTransformHistory}
              onReusePrompt={model.setInput}
              progressEvents={model.progressEvents}
              progressRunning={model.progressRunning}
              onCancelProgress={model.cancelProgress}
            />
          ) : (
            <EditManifestTab
              manifestJson={model.manifestJson}
              manifestError={model.manifestError}
              isSaving={model.isSaving}
              onEditorChange={model.handleEditorChange}
              onSave={model.handleSaveManifest}
            />
          )}
        </div>
      </div>

      <HistoryDialog
        isOpen={model.historyOpen}
        projectId={projectId}
        versions={model.versions}
        loadingVersions={model.loadingVersions}
        revertingId={model.revertingId}
        deletingId={model.deletingId}
        onClose={() => model.setHistoryOpen(false)}
        onClearAll={model.handleClearHistory}
        onRevert={model.handleRevert}
        onDelete={model.handleDeleteVersion}
      />

      <LlmSettingsDialog
        open={llmSettingsOpen}
        onClose={() => setLlmSettingsOpen(false)}
        config={model.llmConfig}
        onSave={(c) => model.setLlmConfig(c)}
      />

      {model.activeTab !== 'transform' && (
        <AiProgressDialog
          isOpen={model.progressOpen}
          title={model.progressTitle}
          events={model.progressEvents}
          isRunning={model.progressRunning}
          onCancel={model.cancelProgress}
          onClose={model.closeProgress}
        />
      )}
    </div>
  );
};
