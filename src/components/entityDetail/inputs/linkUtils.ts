import type { Entity } from '../../../types';

export const normalizeTaskKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

export const getEntityTaskKey = (entity: Entity): string => {
  const tk = entity.properties?.taskKey;
  return typeof tk === 'string' ? tk.trim() : '';
};

export const buildLinkedEntities = (taskKeys: string[], entities: Entity[]) => {
  return taskKeys.map((taskKey) => {
    const linked = entities.find((e) => getEntityTaskKey(e) === taskKey);
    return { taskKey, entity: linked ?? null };
  });
};

export const filterLinkableEntities = (
  entities: Entity[],
  currentEntityId: string,
  query: string
): Entity[] => {
  const q = query.trim().toLowerCase();
  const availableEntities = entities.filter((e) => e.id !== currentEntityId);
  if (!q) return availableEntities.slice(0, 50);
  return availableEntities
    .filter((e) => {
      const tk = getEntityTaskKey(e);
      const title = typeof e.properties?.title === 'string' ? String(e.properties.title).trim() : '';
      return tk.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    })
    .slice(0, 50);
};
