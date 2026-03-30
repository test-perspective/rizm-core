import { useState, useCallback, useEffect } from 'react';
import {
  createImportSession,
  verifyImportConnection,
  fetchImportMetadata,
  fetchLastImportConfig,
  saveImportMapping,
  startImport,
  getImportJobStatus,
  type ImportProvider,
  type ImportProjectMeta,
} from '../../api/import';
import { isBackendEnabled } from '../../utils/storage';
import {
  type ImportWizardStep,
  IMPORT_WIZARD_STEPS,
  suggestRizmProperty,
  type ImportWizardFlowState,
} from './importWizardHelpers';
import type { ImportMetadata, ImportMappingConfig } from '../../api/import';

export interface UseImportWizardFlowOptions {
  open: boolean;
  onClose: () => void;
  onImportComplete?: (projectId: string) => void;
}

export function useImportWizardFlow({ open, onClose, onImportComplete }: UseImportWizardFlowOptions) {
  const [step, setStep] = useState<ImportWizardStep>('provider');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ImportProvider>('jira');
  const [baseUrl, setBaseUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [selectedProject, setSelectedProject] = useState<ImportProjectMeta | null>(null);
  const [metadata, setMetadata] = useState<ImportMetadata | null>(null);
  const [mapping, setMapping] = useState<ImportMappingConfig>({
    fieldMappings: [],
    statusMappings: [],
  });
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportWizardFlowState['importProgress']>(null);

  useEffect(() => {
    if (selectedProject && step === 'start') {
      setProjectName((prev) => prev || selectedProject.name);
      setProjectKey((prev) => prev || selectedProject.key);
    }
  }, [selectedProject, step]);

  useEffect(() => {
    if (open && isBackendEnabled()) {
      fetchLastImportConfig(provider).then((cfg) => {
        const url = cfg.baseUrl ?? cfg.base_url;
        if (url) setBaseUrl(String(url));
        if (cfg.email) setEmail(String(cfg.email));
        const token = cfg.apiToken ?? cfg.api_token;
        if (token) setApiToken(String(token));
      });
    }
  }, [open, provider]);

  const reset = useCallback(() => {
    setStep('provider');
    setSessionId(null);
    setProvider('jira');
    setBaseUrl('');
    setEmail('');
    setApiToken('');
    setSelectedProject(null);
    setMetadata(null);
    setMapping({ fieldMappings: [], statusMappings: [] });
    setProjectName('');
    setProjectKey('');
    setError(null);
    setLoading(false);
    setImportProgress(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const connectionConfig = {
    baseUrl: baseUrl.trim().replace(/\/$/, ''),
    email: email.trim(),
    apiToken: apiToken.trim(),
  };

  const handleVerify = useCallback(async () => {
    if (!isBackendEnabled()) {
      setError('Backend is required for import.');
      return;
    }
    if (!baseUrl.trim() || !email.trim() || !apiToken.trim()) {
      setError('Base URL, email, and API token are required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { sessionId: id } = await createImportSession(provider, connectionConfig);
      setSessionId(id);
      await verifyImportConnection(id);
      const meta = await fetchImportMetadata(id);
      const firstProject = meta.projects[0] ?? null;
      setSelectedProject(firstProject);
      const projectKey = firstProject?.key;
      const metaWithStatuses = projectKey
        ? await fetchImportMetadata(id, projectKey)
        : meta;
      const fieldMappings = metaWithStatuses.fields
        .filter((f) =>
          ['summary', 'description', 'status', 'issuetype', 'priority', 'assignee', 'labels', 'issuelinks'].includes(
            f.id
          )
        )
        .slice(0, 10)
        .map((f) => ({
          externalFieldId: f.id,
          externalFieldName: f.name,
          rizmProperty: suggestRizmProperty(f.id, f.name),
        }));
      const statusMappings = metaWithStatuses.statuses.map((s) => ({
        externalStatusId: s.id,
        externalStatusName: s.name,
        rizmStatus: s.name,
      }));
      setMapping({ fieldMappings, statusMappings });
      setMetadata(metaWithStatuses);
      setStep('metadata');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [provider, baseUrl, email, apiToken]);

  const handleProjectChange = useCallback(async (project: ImportProjectMeta | null) => {
    setSelectedProject(project);
    if (!sessionId || !project) return;
    setError(null);
    setLoading(true);
    try {
      const meta = await fetchImportMetadata(sessionId, project.key);
      setMetadata(meta);
      setMapping((prev) => ({
        ...prev,
        statusMappings: meta.statuses.map((s) => ({
          externalStatusId: s.id,
          externalStatusName: s.name,
          rizmStatus: s.name,
        })),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const handleSaveMapping = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await saveImportMapping(sessionId, mapping);
      setStep('start');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, mapping]);

  const handleStartImport = useCallback(async () => {
    if (!sessionId || !selectedProject) return;
    const name = projectName.trim() || selectedProject.name;
    const key = projectKey.trim().toUpperCase() || selectedProject.key;
    if (!key || key.length < 3) {
      setError('Project key must be 3-10 characters (A-Z0-9).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { jobId, projectId } = await startImport(sessionId, name, key, selectedProject.key);
      setImportProgress({ jobId, projectId, percent: 0, processedCount: 0 });
      const poll = async () => {
        try {
          const status = await getImportJobStatus(jobId);
          setImportProgress((p) =>
            p
              ? {
                  ...p,
                  percent: status.progressPercent,
                  processedCount: status.processedCount ?? 0,
                  totalCount: status.totalCount,
                }
              : null
          );
          if (status.status === 'completed') {
            onImportComplete?.(status.projectId);
            handleClose();
            return;
          }
          if (status.status === 'failed') {
            setError(status.errorMessage ?? 'Import failed');
            setLoading(false);
            setImportProgress(null);
            return;
          }
          setTimeout(poll, 1500);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg.includes('404') ? 'Import failed' : msg);
          setLoading(false);
          setImportProgress(null);
        }
      };
      poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [
    sessionId,
    selectedProject,
    projectName,
    projectKey,
    onImportComplete,
    handleClose,
  ]);

  const stepIndex = IMPORT_WIZARD_STEPS.indexOf(step);
  const canGoBack = stepIndex > 0;
  const goBack = useCallback(() => setStep(IMPORT_WIZARD_STEPS[stepIndex - 1]), [stepIndex]);

  return {
    step,
    setStep,
    sessionId,
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
  };
}
