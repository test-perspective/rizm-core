import type { ImportProvider, ImportMetadata, ImportMappingConfig, ImportProjectMeta } from '../../api/import';

export type ImportWizardStep = 'provider' | 'connection' | 'metadata' | 'mapping' | 'start';

export const IMPORT_WIZARD_STEPS: ImportWizardStep[] = [
  'provider',
  'connection',
  'metadata',
  'mapping',
  'start',
];

export const RIZM_TASK_PROPERTIES = [
  '',
  'title',
  'status',
  'issueType',
  'priority',
  'assigneeId',
  'Description',
  'link',
  'labels',
] as const;

/** Maps Jira field id/name to the best matching Rizm property. Returns '' when no clear match. */
export function suggestRizmProperty(fieldId: string, fieldName: string): string {
  const id = fieldId.toLowerCase();
  const name = fieldName.toLowerCase();
  if (id === 'summary' || name === 'summary') return 'title';
  if (id === 'description' || name === 'description') return 'Description';
  if (id === 'status' || name === 'status') return 'status';
  if (id === 'priority' || name === 'priority') return 'priority';
  if (id === 'assignee' || name === 'assignee') return 'assigneeId';
  if (id === 'issuelinks' || id === 'link' || name === 'link') return 'link';
  if (id === 'labels' || name === 'labels') return 'labels';
  if (id === 'issuetype' || name === 'issuetype') return 'issueType';
  return '';
}

export interface ImportWizardFlowState {
  step: ImportWizardStep;
  sessionId: string | null;
  provider: ImportProvider;
  baseUrl: string;
  email: string;
  apiToken: string;
  selectedProject: ImportProjectMeta | null;
  metadata: ImportMetadata | null;
  mapping: ImportMappingConfig;
  projectName: string;
  projectKey: string;
  error: string | null;
  loading: boolean;
  importProgress: {
    jobId: string;
    projectId: string;
    percent: number;
    processedCount: number;
    totalCount?: number;
  } | null;
}
