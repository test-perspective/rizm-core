import { useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import type { NewProjectInput, NewProjectType } from '../components/sidebar/NewProjectModal';
import { AiProgressEvent } from '../components/aiCommandBar/AiProgressDialog';
import {
  predefinedTransformations,
  transformManifestWithToolsStream,
  type AiProgressStreamEvent,
} from '../utils/aiTransform';
import { ensureWikiInManifest, getDefaultManifest, isAiFallbackForced, isBackendEnabled } from '../utils/storage';
import type { Entity, ProjectManifest } from '../types';

type CreateProjectFn = (args: {
  name: string;
  projectKey: string;
  manifest?: ProjectManifest;
  entities?: Entity[];
}) => { id: string };

type UseCreateProjectHandlerArgs = {
  createProject: CreateProjectFn;
  reload: () => Promise<unknown>;
  navigate: NavigateFunction;
};

export function useCreateProjectHandler({ createProject, reload, navigate }: UseCreateProjectHandlerArgs) {
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AiProgressEvent[]>([]);
  const [progressRunning, setProgressRunning] = useState(false);
  const [progressTitle, setProgressTitle] = useState('AI Transform');
  const progressAbortRef = useRef<AbortController | null>(null);

  const buildManifestFromType = (projectType: NewProjectType, name: string): ProjectManifest => {
    const base =
      projectType === 'development'
        ? getDefaultManifest()
        : predefinedTransformations[projectType]();
    return ensureWikiInManifest({ ...base, name });
  };

  const handleCreateProject = async (input: NewProjectInput) => {
    const name = input.name.trim() || 'Development';
    const baseManifest = buildManifestFromType(input.projectType, name);

    let manifest = baseManifest;
    if (input.usePrompt) {
      if (!isBackendEnabled() || isAiFallbackForced()) {
        throw new Error('Backend is required for prompt-based creation.');
      }
      const userPrompt = input.prompt.trim();
      const controller = new AbortController();
      progressAbortRef.current = controller;
      setProgressTitle('Creating project from prompt');
      setProgressEvents([{ type: 'user', message: userPrompt }]);
      setProgressRunning(true);
      setProgressOpen(true);

      const SKIP_PHASE_MESSAGES = [
        'Starting AI assistant',
        'Starting AI transform with tools',
        'Sending request',
        'Starting transform conversation',
      ];
      const handleStreamEvent = (event: AiProgressStreamEvent) => {
        if (event.type === 'phase') {
          if (!SKIP_PHASE_MESSAGES.includes(event.message)) {
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

      try {
        const llmConfig = input.llmConfig;
        const result = await transformManifestWithToolsStream(
          userPrompt,
          baseManifest,
          undefined,
          llmConfig,
          [],
          handleStreamEvent,
          controller.signal
        );
        manifest = result.manifest;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setProgressEvents((prev) => [...prev, { type: 'phase', message: 'Canceled.' }]);
          throw new Error('Canceled');
        }
        const msg = e instanceof Error ? e.message : String(e);
        setProgressEvents((prev) => [...prev, { type: 'error', message: msg }]);
        throw new Error(msg);
      } finally {
        setProgressRunning(false);
        progressAbortRef.current = null;
      }
      manifest = ensureWikiInManifest({ ...manifest, name });
    }

    const p = createProject({
      name,
      projectKey: input.projectKey ?? '',
      manifest,
      entities: [],
    });
    navigate(`/p/${encodeURIComponent(p.id)}`, { replace: false });
  };

  const handleProgressCancel = () => {
    progressAbortRef.current?.abort();
    setProgressRunning(false);
  };

  const handleProgressClose = () => {
    if (progressRunning) return;
    setProgressOpen(false);
  };

  const handleProjectReload = async () => {
    await reload();
  };

  return {
    handleCreateProject,
    handleProjectReload,
    progressOpen,
    progressEvents,
    progressRunning,
    progressTitle,
    handleProgressCancel,
    handleProgressClose,
  };
}
