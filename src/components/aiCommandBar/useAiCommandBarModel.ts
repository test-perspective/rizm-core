import { useEffect, useRef, useState } from 'react';

import type { ProjectManifest } from '../../types';
import type { AiProgressStreamEvent, LlmConfig } from '../../utils/aiTransform';
import {
  getLlmDisplayLabel,
  getManifestForTransformationInput,
  getStoredLlmConfig,
  setStoredLlmConfig,
  transformConversationStream,
  transformManifestWithToolsStream,
} from '../../utils/aiTransform';
import { buildBitbucketOAuthStartUrl, saveProjectScmConfig } from '../../api/scm';
import { isAiFallbackForced, isBackendEnabled } from '../../utils/storage';
import { parseProjectManifest } from '../../utils/manifestValidation';
import { appendAiHistoryPair, clearAiHistory, getAiHistory } from '../../utils/aiHistory';
import { useAppDialog } from '../dialogs';
import type { AiProgressEvent } from './AiProgressDialog';
import { useManifestHistory } from './useManifestHistory';
import { markReturnToProjectDetailsAfterScmOAuth } from '../../workspace/storage';

type UseAiCommandBarModelParams = {
  isOpen: boolean;
  projectId: string;
  currentManifest: ProjectManifest;
  onClose: () => void;
  onReload: () => Promise<void> | void;
  onTransform: (manifest: ProjectManifest, options?: { source: 'ai_transform' | 'manifest_editor'; message: string }) => void;
};

export function useAiCommandBarModel(params: UseAiCommandBarModelParams) {
  const { isOpen, projectId, currentManifest, onClose, onReload, onTransform } = params;
  const dialog = useAppDialog();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const progressAbortRef = useRef<AbortController | null>(null);

  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'transform' | 'edit'>('transform');
  const [manifestJson, setManifestJson] = useState('');
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [manifestDirty, setManifestDirty] = useState(false);
  const [transformHistory, setTransformHistory] = useState(() => getAiHistory(projectId, 'transform'));
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AiProgressEvent[]>([]);
  const [progressRunning, setProgressRunning] = useState(false);
  const [progressTitle, setProgressTitle] = useState('AI Transform');
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(getStoredLlmConfig);
  const presetsOnly = isAiFallbackForced();

  const {
    historyOpen,
    setHistoryOpen,
    versions,
    loadingVersions,
    revertingId,
    deletingId,
    handleRevert,
    handleDeleteVersion,
    handleClearHistory,
  } = useManifestHistory({
    projectId,
    onReload,
    onCloseCommandBar: onClose,
    dialog,
  });

  useEffect(() => {
    if (isOpen && inputRef.current && activeTab === 'transform') {
      inputRef.current.focus();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    setTransformHistory(getAiHistory(projectId, 'transform'));
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      setManifestDirty(false);
      return;
    }
    if (activeTab === 'edit' && !manifestDirty) {
      try {
        setManifestJson(JSON.stringify(currentManifest, null, 2));
        setManifestError(null);
      } catch {
        setManifestError('Failed to serialize manifest');
      }
    }
  }, [isOpen, activeTab, currentManifest, manifestDirty]);

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

  const handleStreamEvent = (event: AiProgressStreamEvent) => {
    if (event.type === 'phase') {
      if (!shouldSkipPhase(event.message)) {
        setProgressEvents((prev) => [...prev, { type: 'phase', message: event.message }]);
      }
      return;
    }
    if (event.type === 'toolCall') {
      setProgressEvents((prev) => [...prev, { type: 'toolCall', name: event.name }]);
      return;
    }
    if (event.type === 'llmOutput') {
      setProgressEvents((prev) => [...prev, { type: 'llmOutput', text: event.text }]);
      return;
    }
    if (event.type === 'error') {
      setProgressEvents((prev) => [...prev, { type: 'error', message: event.message }]);
      return;
    }
    if (event.type === 'result') {
      setProgressEvents((prev) => [...prev, { type: 'result', message: 'Completed.' }]);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    if (!isBackendEnabled() || presetsOnly) {
      await dialog.alert({
        title: presetsOnly ? 'Presets Only' : 'Backend Disabled',
        message: presetsOnly
          ? 'Preset-only mode: LLM transform is disabled (VITE_KEEL_AI_FORCE_FALLBACK=true).'
          : 'Backend is disabled (VITE_KEEL_BACKEND_URL). Start the backend to use conversational transform.',
      });
      return;
    }
    const controller = new AbortController();
    progressAbortRef.current = controller;
    setProgressTitle('Transform Conversation');
    setProgressEvents([{ type: 'user', message: userMessage }]);
    setProgressRunning(true);
    setIsProcessing(true);
    const historyContext = transformHistory.slice(-12);
    try {
      const message = await transformConversationStream(
        userMessage,
        currentManifest,
        projectId,
        llmConfig,
        historyContext,
        (event) => {
          if (event.type === 'phase' && !shouldSkipPhase(event.message)) {
            setProgressEvents((prev) => [...prev, { type: 'phase', message: event.message }]);
          }
          if (event.type === 'toolCall') setProgressEvents((prev) => [...prev, { type: 'toolCall', name: event.name }]);
          if (event.type === 'llmOutput') setProgressEvents((prev) => [...prev, { type: 'llmOutput', text: event.text }]);
          if (event.type === 'result') setProgressEvents((prev) => [...prev, { type: 'result', message: event.message }]);
          if (event.type === 'error') setProgressEvents((prev) => [...prev, { type: 'error', message: event.message }]);
        },
        controller.signal
      );
      setTransformHistory(appendAiHistoryPair(projectId, 'transform', userMessage, message));
      setInput('');
      setProgressEvents([]);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setProgressEvents((prev) => [...prev, { type: 'phase', message: 'Canceled.' }]);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        await dialog.alert({ title: 'Transform Conversation Failed', message: msg });
      }
    } finally {
      setIsProcessing(false);
      setProgressRunning(false);
      setProgressEvents([]);
      progressAbortRef.current = null;
    }
  };

  const handleGenerateManifest = async () => {
    const startedAt = Date.now();
    setIsProcessing(true);
    try {
      if (isBackendEnabled() && !presetsOnly) {
        const controller = new AbortController();
        progressAbortRef.current = controller;
        setProgressTitle('Generate Manifest');
        setProgressEvents([{ type: 'phase', message: 'Generating manifest from conversation...' }]);
        setProgressRunning(true);

        const historyContext = transformHistory.slice(-12);
        const draft = input.trim();
        const generateInput =
          historyContext.length > 0
            ? draft
              ? `Generate the manifest based on our conversation above.\n\nAdditional context:\n${draft}`
              : 'Generate the manifest based on our conversation above.'
            : draft || 'Generate a default project manifest.';
        const result = await transformManifestWithToolsStream(
          generateInput,
          currentManifest,
          projectId,
          llmConfig,
          historyContext,
          handleStreamEvent,
          controller.signal
        );
        let shouldReconnectBitbucket = false;
        const scmConfigToSave = result.scmConfig;
        if (scmConfigToSave) {
          try {
            await saveProjectScmConfig(projectId, 'bitbucket', scmConfigToSave);
            shouldReconnectBitbucket = true;
          } catch (e) {
            console.warn('[ait] saveProjectScmConfig failed', e);
          }
        }
        console.info('[ait] success (generate)', {
          elapsedMs: Date.now() - startedAt,
          manifestName: result.manifest.name,
        });
        onTransform(result.manifest, { source: 'ai_transform', message: 'Generated from conversation' });
        const transformSummary = `Updated manifest "${result.manifest.name}" with ${result.manifest.entities.length} entities and ${result.manifest.views.length} views.`;
        setTransformHistory(appendAiHistoryPair(projectId, 'transform', generateInput, transformSummary));
        setProgressEvents([]);
        if (shouldReconnectBitbucket) {
          markReturnToProjectDetailsAfterScmOAuth();
          const returnTo = window.location.href;
          const oauthUrl = buildBitbucketOAuthStartUrl(returnTo);
          window.location.assign(oauthUrl);
        }
        return;
      }

      const promptForFallback = input.trim() || transformHistory.filter((h) => h.role === 'user').pop()?.content || '';
      const fallback = getManifestForTransformationInput(promptForFallback);
      if (fallback) {
        onTransform(fallback, { source: 'ai_transform', message: promptForFallback || 'preset' });
        const fallbackSummary = `Applied preset transform and generated "${fallback.name}".`;
        setTransformHistory(appendAiHistoryPair(projectId, 'transform', promptForFallback || 'preset', fallbackSummary));
        setInput('');
        return;
      }

      await dialog.alert({
        title: presetsOnly ? 'No Preset Matched' : 'Backend Disabled',
        message: presetsOnly
          ? 'Preset-only mode. Use quick transforms: CRM, Inventory, Book, Bug.'
          : 'Backend is disabled. Start the backend to use LLM transformation.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof DOMException && e.name === 'AbortError') {
        setProgressEvents((prev) => [...prev, { type: 'phase', message: 'Canceled.' }]);
      } else {
        console.error('[ait] failed', { elapsedMs: Date.now() - startedAt, error: e });
        setProgressEvents((prev) => [...prev, { type: 'error', message: msg }]);
        await dialog.alert({ title: 'AI Transformation Failed', message: msg });
      }
    } finally {
      setProgressRunning(false);
      setProgressEvents([]);
      progressAbortRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleClearTransformHistory = () => {
    clearAiHistory(projectId, 'transform');
    setTransformHistory([]);
  };

  const handleSaveManifest = async () => {
    if (!manifestJson.trim()) {
      setManifestError('Manifest JSON is empty');
      return;
    }
    setIsSaving(true);
    setManifestError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(manifestJson);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setManifestError(`JSON parse error: ${msg}`);
        setIsSaving(false);
        return;
      }

      let validated: ProjectManifest;
      try {
        validated = parseProjectManifest(parsed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setManifestError(`Validation error: ${msg}`);
        setIsSaving(false);
        return;
      }

      onTransform(validated, { source: 'manifest_editor', message: 'editor save' });
      setManifestError(null);
      setManifestDirty(false);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setManifestError(`Save failed: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    setManifestJson(value || '');
    setManifestError(null);
    setManifestDirty(true);
  };

  const cancelProgress = () => {
    progressAbortRef.current?.abort();
    setProgressRunning(false);
  };

  const closeProgress = () => {
    if (progressRunning) return;
    setProgressOpen(false);
  };

  return {
    presetsOnly,
    inputRef,
    input,
    setInput,
    isProcessing,
    activeTab,
    setActiveTab,
    manifestJson,
    manifestError,
    isSaving,
    transformHistory,
    progressOpen,
    progressEvents,
    progressRunning,
    progressTitle,
    llmConfig,
    setLlmConfig,
    llmDisplayLabel: getLlmDisplayLabel(llmConfig),
    historyOpen,
    setHistoryOpen,
    versions,
    loadingVersions,
    revertingId,
    deletingId,
    handleRevert,
    handleDeleteVersion,
    handleClearHistory,
    handleSendMessage,
    handleGenerateManifest,
    handleClearTransformHistory,
    handleSaveManifest,
    handleEditorChange,
    cancelProgress,
    closeProgress,
  };
}
