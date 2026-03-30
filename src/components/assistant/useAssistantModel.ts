import { useEffect, useRef, useState } from 'react';
import { getStoredLlmConfig, setStoredLlmConfig, type LlmConfig } from '../../utils/aiTransform';
import { askRizmAssistantStream } from '../../utils/aiAssistant';
import { appendAiHistoryPair, clearAiHistory, getAiHistory } from '../../utils/aiHistory';
import { isAiFallbackForced, isBackendEnabled } from '../../utils/storage';
import { useAppDialog } from '../dialogs';
import type { AiProgressEvent } from '../aiCommandBar/AiProgressDialog';

export type UseAssistantModelParams = {
  projectId: string;
  presetsOnly?: boolean;
};

export function useAssistantModel({ projectId, presetsOnly: presetsOnlyParam }: UseAssistantModelParams) {
  const dialog = useAppDialog();
  const progressAbortRef = useRef<AbortController | null>(null);
  const presetsOnly = presetsOnlyParam ?? isAiFallbackForced();

  const [input, setInput] = useState('');
  const [history, setHistory] = useState(() => getAiHistory(projectId, 'assistant'));
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AiProgressEvent[]>([]);
  const [progressRunning, setProgressRunning] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(getStoredLlmConfig);

  useEffect(() => {
    setHistory(getAiHistory(projectId, 'assistant'));
  }, [projectId]);

  useEffect(() => {
    setStoredLlmConfig(llmConfig);
  }, [llmConfig]);

  const SKIP_PHASE_MESSAGES = [
    'Starting AI assistant',
    'Starting AI transform with tools',
    'Sending request',
    'Starting transform conversation',
  ];
  const shouldSkipPhase = (msg: string) => SKIP_PHASE_MESSAGES.includes(msg);

  const handleSubmit = async () => {
    const userMessage = input.trim();
    if (!userMessage) return;
    if (!isBackendEnabled() || presetsOnly) {
      await dialog.alert({
        title: 'Backend Disabled',
        message: 'Backend is disabled (VITE_KEEL_BACKEND_URL) or presets-only mode is enabled.',
      });
      return;
    }
    const controller = new AbortController();
    progressAbortRef.current = controller;
    setProgressEvents([{ type: 'user', message: userMessage }]);
    setProgressRunning(true);
    setIsProcessing(true);

    const historyContext = history.slice(-12);

    try {
      const message = await askRizmAssistantStream(
        userMessage,
        projectId || undefined,
        llmConfig,
        historyContext,
        (event) => {
          setProgressEvents((prev) => {
            if (event.type === 'phase' && !shouldSkipPhase(event.message)) {
              return [...prev, { type: 'phase', message: event.message }];
            }
            if (event.type === 'toolCall') return [...prev, { type: 'toolCall', name: event.name }];
            if (event.type === 'llmOutput') return [...prev, { type: 'llmOutput', text: event.text }];
            if (event.type === 'result') return [...prev, { type: 'result', message: event.message }];
            if (event.type === 'error') return [...prev, { type: 'error', message: event.message }];
            return prev;
          });
        },
        controller.signal
      );
      setHistory(appendAiHistoryPair(projectId, 'assistant', userMessage, message));
      setInput('');
      setProgressEvents([]);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setProgressEvents((prev) => [...prev, { type: 'phase', message: 'Canceled.' }]);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        await dialog.alert({ title: 'Assistant Failed', message: msg });
      }
    } finally {
      setIsProcessing(false);
      setProgressRunning(false);
      setProgressEvents([]);
      progressAbortRef.current = null;
    }
  };

  const handleClearHistory = () => {
    clearAiHistory(projectId, 'assistant');
    setHistory([]);
  };

  const cancelProgress = () => {
    progressAbortRef.current?.abort();
    setProgressRunning(false);
  };

  return {
    input,
    setInput,
    history,
    isProcessing,
    presetsOnly,
    llmConfig,
    setLlmConfig,
    handleSubmit,
    handleClearHistory,
    progressEvents,
    progressRunning,
    cancelProgress,
  };
}
