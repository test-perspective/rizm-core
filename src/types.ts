import type { TaskComment } from './utils/comments';

export interface Entity {
  id: string;
  entityId: string;
  createdAt: number;
  updatedAt: number;
  properties: Record<string, any>;
}

export type ScmProvider = 'bitbucket';

export interface ScmRepoRef {
  workspace: string;
  repoSlug: string;
}

export interface ScmProjectConfig {
  provider: ScmProvider;
  config: ScmRepoRef;
}

export interface ScmOAuthStatus {
  provider: ScmProvider;
  connected: boolean;
}

export interface ScmBranchesResponse {
  branches: string[];
  mainbranch?: string;
}

export interface ScmBranchInfo {
  provider: ScmProvider;
  repo: ScmRepoRef;
  name: string;
  url: string;
}

export interface ScmPullRequestInfo {
  provider: ScmProvider;
  repo: ScmRepoRef;
  id: string;
  title: string;
  url: string;
  sourceBranch: string;
  destinationBranch: string;
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType?: string;
  size: number;
  createdAt: number;
}

export interface PropertyDefinition {
  name: string;
  type: 'text' | 'richtext' | 'select' | 'labels' | 'number' | 'date' | 'boolean' | 'link' | 'user';
  options?: string[];
  visible?: boolean;
}

/** Minimal user info for assignee selection */
export interface UserSummary {
  id: string;
  email: string;
}

export interface BoardDivider {
  id: string;
  title: string;
  columnId: string;
  afterId?: string;
  sort?: number;
}

export interface ViewConfig {
  id: string;
  name: string;
  type: 'list' | 'board' | 'table' | 'wiki';
  entityId: string;
  groupBy?: string;
  visibleProperties: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  columnOrder?: string[];
  hiddenColumns?: string[];
  boardDividers?: BoardDivider[];
}

export interface EntityDefinition {
  id: string;
  name: string;
  namePlural: string;
  properties: PropertyDefinition[];
  defaultView?: string;
  /** Property name treated as "title" for required-on-save and display (e.g. "title", "name"). */
  titleLikeProperty?: string;
}

export interface ProjectManifest {
  name: string;
  entities: EntityDefinition[];
  views: ViewConfig[];
  defaultView: string;
}

export interface ProjectConfig {
  manifest: ProjectManifest;
}

export interface Project {
  id: string;
  name: string;
  projectKey?: string;
  lifecycleStatus?: string;
  createdAt: number;
  updatedAt: number;
  entities: Entity[];
  config: ProjectConfig;
}

export interface ProjectMeta {
  id: string;
  name: string;
  projectKey?: string;
  lifecycleStatus?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Current persisted shape (multi-project).
 */
export interface StorageData {
  projects: Project[];
  activeProjectId: string;
  version: number;
}

export interface ProjectsIndexResponse {
  activeProjectId: string;
  projects: ProjectMeta[];
}

export interface ProjectStateResponse {
  project: Project;
  manifestEtag: string;
}

export type WikiNodeType = 'page' | 'folder';

export interface WikiPageMeta {
  id: string;
  title: string;
  updatedAt: number;
  nodeType?: WikiNodeType;
  parentId?: string | null;
  order?: number;
}

export interface WikiPageResponse {
  id: string;
  title: string;
  updatedAt: number;
  doc: string;
  crdtBlob?: number[];
  comments?: TaskComment[];
  nodeType?: WikiNodeType;
  parentId?: string | null;
  order?: number;
}
