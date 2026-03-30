import { useState } from 'react';
import { X } from 'lucide-react';
import { isBackendEnabled } from '../../utils/storage';
import { AssistantPanel } from '../../components/assistant/AssistantPanel';
import { LlmSettingsDialog } from '../../components/aiCommandBar/LlmSettingsDialog';
import { useAssistantModel } from '../../components/assistant/useAssistantModel';

type AssistantDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function AssistantDialog({ open, onClose }: AssistantDialogProps) {
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);
  const model = useAssistantModel({ projectId: '' });

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">AI Assistant</h3>
              {isBackendEnabled() && !model.presetsOnly && (
                <button
                  type="button"
                  onClick={() => setLlmSettingsOpen(true)}
                  disabled={model.isProcessing}
                  className="flex items-center gap-1.5 px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors disabled:opacity-50"
                >
                  LLM Settings
                </button>
              )}
            </div>
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
              Ask the assistant for help with admin tasks, project management, or general Rizm questions.
            </p>
            <AssistantPanel
              input={model.input}
              onInputChange={model.setInput}
              onSubmit={model.handleSubmit}
              isProcessing={model.isProcessing}
              history={model.history}
              onClearHistory={model.handleClearHistory}
              presetsOnly={model.presetsOnly}
              placeholder="e.g., List all users, Show me project structure..."
              progressEvents={model.progressEvents}
              progressRunning={model.progressRunning}
              onCancelProgress={model.cancelProgress}
            />
          </div>
        </div>
      </div>
      <LlmSettingsDialog
        open={llmSettingsOpen}
        onClose={() => setLlmSettingsOpen(false)}
        config={model.llmConfig}
        onSave={(c) => model.setLlmConfig(c)}
      />
    </>
  );
}
