import { computeOrderForNewEntityAtBottomInLane, ORDER_KEY } from '../components/board/boardOrder';
import type { Entity, PropertyDefinition, ViewConfig } from '../types';
import { getInitialGroupByValueForNewEntity } from '../utils/boardColumns';

export type BuildCreateEntityDefaultsArgs = {
  currentView: ViewConfig;
  properties: PropertyDefinition[];
  currentEntities: Entity[];
  /** When set (board lane +Create), use this column value instead of the leftmost visible lane. */
  groupByValue?: string;
};

export function buildDefaultPropertiesForNewEntity({
  currentView,
  properties,
  currentEntities,
  groupByValue,
}: BuildCreateEntityDefaultsArgs): Record<string, unknown> {
  const initialGroupByValue =
    currentView.type === 'board'
      ? groupByValue ?? getInitialGroupByValueForNewEntity(currentView, properties)
      : undefined;

  const defaultProps: Record<string, unknown> = {};
  properties.forEach((prop) => {
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
    const order = computeOrderForNewEntityAtBottomInLane(laneEntities);
    if (order !== null) {
      defaultProps[ORDER_KEY] = order;
    }
  }

  return defaultProps;
}
