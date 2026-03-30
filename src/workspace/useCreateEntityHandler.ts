import { useCallback } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { getInitialGroupByValueForNewEntity } from '../utils/boardColumns';
import { computeOrderForNewEntityAtTopInLane, ORDER_KEY } from '../components/board/boardOrder';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';

type BuildPathFn = (params: { projectId: string; viewId: string; entityId?: string | null }) => string;

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
  const handleCreateEntity = useCallback(() => {
    if (!currentView || !currentEntity || !activeProjectId) return;
    if (currentView.type === 'wiki') return;

    const initialGroupByValue =
      currentView.type === 'board'
        ? getInitialGroupByValueForNewEntity(currentView, currentEntity.properties)
        : undefined;

    const defaultProps: Record<string, unknown> = {};
    currentEntity.properties.forEach((prop) => {
      if (prop.type === 'text') {
        if (prop.name === 'taskKey') return;
        defaultProps[prop.name] = '';
      } else if (prop.type === 'select' && prop.options && prop.options.length > 0) {
        if (initialGroupByValue && prop.name === currentView.groupBy) {
          defaultProps[prop.name] = initialGroupByValue;
        } else {
          defaultProps[prop.name] = prop.options[0];
        }
      }
    });

    if (currentView.type === 'board' && initialGroupByValue && currentView.groupBy) {
      const laneEntities = currentEntities.filter(
        (e) => e.properties[currentView.groupBy!] === initialGroupByValue
      );
      const order = computeOrderForNewEntityAtTopInLane(laneEntities);
      defaultProps[ORDER_KEY] = order;
    }

    const newEntity = addEntity(currentView.entityId, defaultProps);
    if (effectiveViewId) {
      navigate(buildPath({ projectId: activeProjectId, viewId: effectiveViewId, entityId: newEntity.id }), { replace: false });
    }
  }, [
    currentView,
    currentEntity,
    currentEntities,
    addEntity,
    effectiveViewId,
    activeProjectId,
    navigate,
    buildPath,
  ]);

  return { handleCreateEntity };
}
