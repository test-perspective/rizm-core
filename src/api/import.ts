import { apiJson, apiFetch } from '../auth/api';

export type ImportProvider = 'jira' | 'backlog';

export interface ImportProjectMeta {
  id: string;
  key: string;
  name: string;
}

export interface ImportFieldMeta {
  id: string;
  name: string;
  fieldType: string;
  custom: boolean;
}

export interface ImportStatusMeta {
  id: string;
  name: string;
  category?: string;
}

export interface ImportMetadata {
  provider: string;
  projects: ImportProjectMeta[];
  fields: ImportFieldMeta[];
  statuses: ImportStatusMeta[];
}

export interface FieldMapping {
  externalFieldId: string;
  externalFieldName: string;
  rizmProperty: string;
}

export interface StatusMapping {
  externalStatusId: string;
  externalStatusName: string;
  rizmStatus: string;
}

export interface UserMapping {
  externalUserId?: string;
  externalEmail?: string;
  rizmUserId?: string;
}

export interface ImportMappingConfig {
  fieldMappings: FieldMapping[];
  statusMappings: StatusMapping[];
  userMappings?: UserMapping[];
  excludedStatuses?: string[];
  /** When set, issues with empty sprint (Jira backlog) get this status. */
  mapBacklogToStatus?: string;
}

export interface ImportJobStatus {
  id: string;
  projectId: string;
  status: string;
  progressPercent: number;
  processedCount: number;
  totalCount?: number;
  errorMessage?: string;
}

export async function fetchLastImportConfig(
  provider: ImportProvider = 'jira'
): Promise<Record<string, unknown>> {
  try {
    return await apiJson<Record<string, unknown>>(
      `/api/import/last-config?provider=${encodeURIComponent(provider)}`
    );
  } catch {
    return {};
  }
}

export async function createImportSession(
  provider: ImportProvider,
  connectionConfig: Record<string, unknown>
): Promise<{ sessionId: string }> {
  return await apiJson<{ sessionId: string }>('/api/import/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, connectionConfig }),
  });
}

export async function verifyImportConnection(sessionId: string): Promise<void> {
  const res = await apiFetch(`/api/import/sessions/${encodeURIComponent(sessionId)}/verify`, {
    method: 'POST',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function fetchImportMetadata(
  sessionId: string,
  projectIdOrKey?: string
): Promise<ImportMetadata> {
  return await apiJson<ImportMetadata>(`/api/import/sessions/${encodeURIComponent(sessionId)}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIdOrKey: projectIdOrKey ?? null }),
  });
}

export async function saveImportMapping(
  sessionId: string,
  mapping: ImportMappingConfig
): Promise<void> {
  const res = await apiFetch(`/api/import/sessions/${encodeURIComponent(sessionId)}/mapping`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapping }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function startImport(
  sessionId: string,
  projectName: string,
  projectKey: string,
  externalProjectIdOrKey: string
): Promise<{ jobId: string; projectId: string }> {
  return await apiJson<{ jobId: string; projectId: string }>(
    `/api/import/sessions/${encodeURIComponent(sessionId)}/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName,
        projectKey,
        externalProjectIdOrKey,
      }),
    }
  );
}

export async function getImportJobStatus(jobId: string): Promise<ImportJobStatus> {
  return await apiJson<ImportJobStatus>(`/api/import/jobs/${encodeURIComponent(jobId)}`);
}
