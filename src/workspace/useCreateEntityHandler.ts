import { useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { buildDefaultPropertiesForNewEntity } from './buildCreateEntityDefaults';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';

type BuildPathFn = (params: { projectId: string; viewId: string; entityId?: string | null }) => string;

export type CreateEntityOptions = {
  groupByValue?: string;
};

type UseCreateEntityHandlerArgs = {
  currentView: ViewConfig | null;
  currentEntity: { id: string; properties: PropertyDefinition[] } | null;
  currentEntities: Entity[];
  activeProjectId: string;
  effectiveViewId?: string;
  buildPath: BuildPathFn;
  navigate: NavigateFunction;
  addEntity: (entityTypeId: string, properties: Record<string, unknown>) => Entity;
};

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
    (options?: CreateEntityOptions) => {
      if (!currentView || !currentEntity || !activeProjectId) return;
      if (currentView.type === 'wiki') return;

      const defaultProps = buildDefaultPropertiesForNewEntity({
        currentView,
        properties: currentEntity.properties,
        currentEntities,
        groupByValue: options?.groupByValue,
      });

      const newEntity = addEntity(currentView.entityId, defaultProps);
      if (effectiveViewId) {
        navigate(
          buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: newEntity.id }),
          { replace: false }
        );
      }
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
