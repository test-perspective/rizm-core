import type { PropertyDefinition } from '../../types';

export const getDeferredSaveProperties = (properties: PropertyDefinition[]): Set<string> => {
  return new Set(
    properties
      .filter((p) => p.type === 'text' || p.type === 'richtext')
      .map((p) => p.name)
  );
};

export const getDeferredChanges = (
  currentValues: Record<string, any>,
  lastSavedValues: Record<string, any>,
  deferredProps: Set<string>
): Record<string, any> => {
  const changes: Record<string, any> = {};
  for (const propName of deferredProps) {
    const currentValue = currentValues[propName];
    const lastSavedValue = lastSavedValues[propName];
    if (currentValue !== undefined && currentValue !== lastSavedValue) {
      changes[propName] = currentValue;
    }
  }
  return changes;
};
