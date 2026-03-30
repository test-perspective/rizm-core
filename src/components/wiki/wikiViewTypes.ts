import type React from 'react';
import type { Entity } from '../../types';
import type { CreateWikiNodeOptions } from './wikiPersistenceHelpers';

export type WikiViewProps = {
  projectId: string;
  viewId?: string;
  pages: Entity[];
  selectedPageId: string | null;
  onSelectPage: (id: string) => void;
  onCreatePage: (opts?: CreateWikiNodeOptions) => Entity;
  onDeletePage: (id: string) => void;
  onUpdatePage: (id: string, patch: Record<string, any>) => void;
  onRefreshProject?: () => void | Promise<unknown>;
  entities?: Entity[];
  onEntityClick?: (entity: Entity) => void;
  onServerEntity?: (entity: Entity, etag: string) => void;
  searchQuery?: string;
  /** REQ-242: Ref for header New Page to call same flow as create toplevel page */
  wikiCreateRef?: React.MutableRefObject<(() => void) | null>;
};
