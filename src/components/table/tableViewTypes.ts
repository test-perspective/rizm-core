import type { Entity, PropertyDefinition, UserSummary, ViewConfig } from '../../types';
import type { TableRow } from './types';

export interface TableViewProps {
  entities: Entity[];
  view: ViewConfig;
  properties: PropertyDefinition[];
  onEntityUpdate: (entityId: string, patch: Record<string, any>) => void;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => void;
  onEntityClick?: (entity: Entity) => void;
  allEntities?: Entity[];
  projectId: string;
  projectKey: string;
  usersById?: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
  onReload?: () => void | Promise<unknown>;
  /** Sorted entity ids on the current table page (for detail panel keyboard navigation). */
  onTablePageEntityOrderChange?: (entityIdsOnPage: string[]) => void;
}

export const builtinFieldMap: Record<'createdAt' | 'updatedAt' | 'id', keyof TableRow> = {
  createdAt: '__createdAt',
  updatedAt: '__updatedAt',
  id: '__id',
};
