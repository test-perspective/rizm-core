import { useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { buildDefaultPropertiesForNewEntity } from './buildCreateEntityDefaults';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';

type BuildPathFn = (params: { projectId: string; viewId: string; entityId?: string | null }) => string;

export type CreateEntityOptions = {
  groupByValue?: string;
  title?: string;
  /** When false, skip navigating to the entity detail panel. Defaults to true. */
  openDetail?: boolean;
};

type UseCreateEntityHandlerArgs = {
  currentView: ViewConfig | null;
  currentEntity: { id: string; properties: PropertyDefinition[]; titleLikeProperty?: string } | null;
  currentEntities: Entity[];
  activeProjectId: string;
  effectiveViewId?: string;
  buildPath: BuildPathFn;
  navigate: NavigateFunction;
  addEntity: (entityTypeId: string, properties: Record<string, unknown>) => Entity;
};

export function resolveTitleLikeProperty(
  currentEntity: { properties: PropertyDefinition[]; titleLikeProperty?: string }
): string | undefined {
  if (currentEntity.titleLikeProperty) {
    return currentEntity.titleLikeProperty;
  }
  if (currentEntity.properties.some((p) => p.name === 'title')) {
    return 'title';
  }
  return undefined;
}

export function useCreateEntityHandler({
  currentView,
  currentEntity,
  currentEntities,
  activeProjectId,
  effectiveViewId,
  buildPath,
  navigate,
  addEntity,
}: UseCreateEntityHandlerArgs) {
  const handleCreateEntity = useCallback(
    (options?: CreateEntityOptions): Entity | undefined => {
      if (!currentView || !currentEntity || !activeProjectId) return undefined;
      if (currentView.type === 'wiki') return undefined;

      const defaultProps = buildDefaultPropertiesForNewEntity({
        currentView,
        properties: currentEntity.properties,
        currentEntities,
        groupByValue: options?.groupByValue,
      });

      const titleLikeProperty = resolveTitleLikeProperty(currentEntity);
      if (options?.title !== undefined && titleLikeProperty) {
        defaultProps[titleLikeProperty] = options.title.trim();
      }

      const newEntity = addEntity(currentView.entityId, defaultProps);
      const openDetail = options?.openDetail !== false;
      if (openDetail && effectiveViewId) {
        navigate(
          buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: newEntity.id }),
          { replace: false }
        );
      }
      return newEntity;
    },
    [
      currentView,
      currentEntity,
      currentEntities,
      addEntity,
      effectiveViewId,
      activeProjectId,
      navigate,
      buildPath,
    ]
  );

  return { handleCreateEntity };
}
