import type { ProjectManifest } from '../types';

export const upsertPropertyOption = (
  manifest: ProjectManifest,
  entityId: string,
  propName: string,
  option: string
): ProjectManifest => {
  const trimmed = option.trim();
  if (!trimmed) return manifest;

  let changed = false;
  const entities = manifest.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    const props = entity.properties.map((prop) => {
      if (prop.name !== propName) return prop;
      const nextOptions = [...(prop.options ?? [])];
      if (!nextOptions.includes(trimmed)) {
        nextOptions.push(trimmed);
        changed = true;
      }
      return { ...prop, options: nextOptions };
    });
    return { ...entity, properties: props };
  });

  const entityFound = entities.some((e) => e.id === entityId);
  if (!entityFound) {
    throw new Error(`Entity '${entityId}' not found`);
  }

  const propFound = entities
    .find((e) => e.id === entityId)
    ?.properties.some((p) => p.name === propName);
  if (!propFound) {
    throw new Error(`Property '${propName}' not found on entity '${entityId}'`);
  }

  if (!changed) return manifest;
  return { ...manifest, entities };
};
