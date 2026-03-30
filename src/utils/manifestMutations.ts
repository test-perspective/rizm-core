import type { ProjectManifest, PropertyDefinition, ViewConfig } from '../types';

type BoardCleanupResult =
  | { kind: 'keep_board'; groupBy: string }
  | { kind: 'convert_to_list' };

const cloneView = (v: ViewConfig): ViewConfig => ({
  ...v,
  visibleProperties: [...v.visibleProperties],
});

const ensureNonEmptyVisibleProperties = (
  visibleProperties: string[],
  remainingPropertyNames: string[]
): string[] => {
  if (visibleProperties.length > 0) return visibleProperties;
  if (remainingPropertyNames.length === 0) return visibleProperties;
  return [remainingPropertyNames[0]];
};

const cleanupBoardViewAfterGroupByRemoval = (
  remainingProps: PropertyDefinition[]
): BoardCleanupResult => {
  const replacement = remainingProps.find((p) => p.type === 'select')?.name;
  if (replacement) return { kind: 'keep_board', groupBy: replacement };
  return { kind: 'convert_to_list' };
};

export function addPropertyToEntity(
  manifest: ProjectManifest,
  entityId: string,
  viewId: string | undefined,
  prop: PropertyDefinition
): ProjectManifest {
  const entities = manifest.entities.map((e) => {
    if (e.id !== entityId) return e;
    if (e.properties.some((p) => p.name === prop.name)) {
      throw new Error(`Property '${prop.name}' already exists on entity '${entityId}'`);
    }
    return { ...e, properties: [...e.properties, prop] };
  });

  if (!entities.some((e) => e.id === entityId)) {
    throw new Error(`Entity '${entityId}' not found`);
  }

  const views = manifest.views.map((v) => {
    const view = cloneView(v);
    if (!viewId) return view;
    if (view.id !== viewId) return view;
    if (view.entityId !== entityId) return view;
    if (!view.visibleProperties.includes(prop.name)) {
      view.visibleProperties.push(prop.name);
    }
    return view;
  });

  return { ...manifest, entities, views };
}

export function removePropertyFromEntity(
  manifest: ProjectManifest,
  entityId: string,
  propName: string
): ProjectManifest {
  const entityBefore = manifest.entities.find((e) => e.id === entityId);
  if (!entityBefore) throw new Error(`Entity '${entityId}' not found`);

  if (propName === 'taskKey') {
    throw new Error('Property \'taskKey\' is server-managed and cannot be removed');
  }

  if (!entityBefore.properties.some((p) => p.name === propName)) {
    // Treat as a hard error: the UI and manifest are out of sync.
    throw new Error(`Property '${propName}' not found on entity '${entityId}'`);
  }

  const entities = manifest.entities.map((e) => {
    if (e.id !== entityId) return e;
    return { ...e, properties: e.properties.filter((p) => p.name !== propName) };
  });

  const entityAfter = entities.find((e) => e.id === entityId)!;
  const remainingPropNames = entityAfter.properties.map((p) => p.name);

  const views = manifest.views.map((v) => {
    if (v.entityId !== entityId) return v;
    const view = cloneView(v);

    view.visibleProperties = view.visibleProperties.filter((p) => p !== propName);
    view.visibleProperties = ensureNonEmptyVisibleProperties(view.visibleProperties, remainingPropNames);

    if (view.sortBy === propName) {
      view.sortBy = 'updatedAt';
    }

    if (view.type === 'board' && view.groupBy === propName) {
      const cleanup = cleanupBoardViewAfterGroupByRemoval(entityAfter.properties);
      if (cleanup.kind === 'keep_board') {
        view.groupBy = cleanup.groupBy;
      } else {
        const converted: ViewConfig = {
          ...view,
          type: 'table',
          groupBy: undefined,
        };
        return converted;
      }
    }

    return view;
  });

  return { ...manifest, entities, views };
}

/**
 * Helper for reordering sidebar views.
 *
 * - Keeps position and order of views with `type === 'list'` in manifest.views unchanged
 * - Reorders only non-list views (board, table, wiki, etc.) to match `orderedNonListViewIds`
 *
 * Example:
 *   views: [list1, board, table, list2, wiki]
 *   orderedNonListViewIds: [table, wiki, board]
 *   result: [list1, table, wiki, list2, board]
 */
export function reorderViews(
  manifest: ProjectManifest,
  orderedNonListViewIds: string[]
): ProjectManifest {
  const allNonListViews = manifest.views.filter((v) => v.type !== 'list');
  const allNonListIds = allNonListViews.map((v) => v.id);

  if (orderedNonListViewIds.length !== allNonListIds.length) {
    throw new Error(
      `reorderViews: expected ${allNonListIds.length} non-list ids, got ${orderedNonListViewIds.length}`
    );
  }

  const idSet = new Set(orderedNonListViewIds);
  if (idSet.size !== orderedNonListViewIds.length) {
    throw new Error('reorderViews: duplicate ids in orderedNonListViewIds');
  }

  for (const id of allNonListIds) {
    if (!idSet.has(id)) {
      throw new Error(`reorderViews: missing id '${id}' in orderedNonListViewIds`);
    }
  }

  const viewById = new Map<string, ViewConfig>();
  for (const v of manifest.views) {
    viewById.set(v.id, v);
  }

  const nextViews: ViewConfig[] = [];
  let nonListIndex = 0;

  for (const v of manifest.views) {
    if (v.type === 'list') {
      nextViews.push(v);
    } else {
      const targetId = orderedNonListViewIds[nonListIndex++];
      const targetView = viewById.get(targetId);
      if (!targetView) {
        throw new Error(`reorderViews: view '${targetId}' not found in manifest`);
      }
      nextViews.push(targetView);
    }
  }

  return { ...manifest, views: nextViews };
}

/**
 * Reorder properties within an entity.
 * orderedPropNames must contain exactly the same property names as the entity has, in the new order.
 */
export function reorderPropertiesInEntity(
  manifest: ProjectManifest,
  entityId: string,
  orderedPropNames: string[]
): ProjectManifest {
  const entity = manifest.entities.find((e) => e.id === entityId);
  if (!entity) throw new Error(`Entity '${entityId}' not found`);

  const currentNames = entity.properties.map((p) => p.name);
  const orderedSet = new Set(orderedPropNames);

  if (orderedPropNames.length !== currentNames.length) {
    throw new Error(
      `reorderPropertiesInEntity: expected ${currentNames.length} property names, got ${orderedPropNames.length}`
    );
  }

  for (const name of currentNames) {
    if (!orderedSet.has(name)) {
      throw new Error(`reorderPropertiesInEntity: missing property '${name}' in orderedPropNames`);
    }
  }

  const propByName = new Map(entity.properties.map((p) => [p.name, p]));
  const reordered = orderedPropNames.map((name) => {
    const p = propByName.get(name);
    if (!p) throw new Error(`reorderPropertiesInEntity: property '${name}' not found`);
    return p;
  });

  const entities = manifest.entities.map((e) => {
    if (e.id !== entityId) return e;
    return { ...e, properties: reordered };
  });

  return { ...manifest, entities };
}

