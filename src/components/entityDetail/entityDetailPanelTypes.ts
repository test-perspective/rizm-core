import type { Entity, PropertyDefinition, UserSummary } from '../../types';

export interface EntityDetailPanelProps {
  entity: Entity | null;
  projectId: string;
  entityTypeId: string;
  viewId: string;
  properties: PropertyDefinition[];
  /** Property name treated as title for required-on-close check (e.g. "title", "name"). */
  titleLikeProperty?: string;
  /**
   * When false, hides schema editing (e.g. task opened as overlay from wiki — wrong view context for manifest edits).
   * @default true
   */
  allowSchemaEdit?: boolean;
  entities?: Entity[];
  onClose: () => void;
  onUpdate: (id: string, properties: Record<string, any>) => void;
  onServerEntity: (entity: Entity, etag: string) => void;
  onDelete: (id: string) => void;
  onAddPropertyDefinition: (prop: PropertyDefinition) => void;
  onRemovePropertyDefinition: (propName: string) => void;
  onReorderProperties?: (orderedPropNames: string[]) => void;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => void;
  onEntityClick?: (entity: Entity) => void;
  usersById?: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
  /** Optional: navigate to previous issue in the current table page / board lane (ArrowLeft). */
  onNavigateDetailPrev?: () => void;
  /** Optional: navigate to next issue in the current table page / board lane (ArrowRight). */
  onNavigateDetailNext?: () => void;
}
