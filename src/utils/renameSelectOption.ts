import type { ProjectManifest, ViewConfig } from '../types';

const cloneView = (v: ViewConfig): ViewConfig => ({
  ...v,
  visibleProperties: [...v.visibleProperties],
  columnOrder: v.columnOrder ? [...v.columnOrder] : undefined,
  hiddenColumns: v.hiddenColumns ? [...v.hiddenColumns] : undefined,
  boardDividers: v.boardDividers?.map((d) => ({ ...d })),
});

const mapColumnRef = (arr: string[] | undefined, from: string, to: string): string[] | undefined => {
  if (!arr || arr.length === 0) return arr;
  let changed = false;
  const next = arr.map((x) => {
    if (x === from) {
      changed = true;
      return to;
    }
    return x;
  });
  return changed ? next : arr;
};

/**
 * Phase 1: Add the new option next to the old one so board columns exist for both values
 * while entities are migrated from `from` to `to`.
 */
export function prepareSelectOptionRenameInManifest(
  manifest: ProjectManifest,
  entityTypeId: string,
  propName: string,
  from: string,
  to: string
): ProjectManifest {
  const fromTrimmed = from.trim();
  const toTrimmed = to.trim();
  if (!fromTrimmed || !toTrimmed) {
    throw new Error('Old and new option names must be non-empty');
  }
  if (fromTrimmed === toTrimmed) {
    return manifest;
  }

  const entityDef = manifest.entities.find((e) => e.id === entityTypeId);
  if (!entityDef) {
    throw new Error(`Entity '${entityTypeId}' not found`);
  }

  const prop = entityDef.properties.find((p) => p.name === propName);
  if (!prop || prop.type !== 'select' || !prop.options?.length) {
    throw new Error(`Select property '${propName}' not found on entity '${entityTypeId}'`);
  }

  const opts = prop.options;
  if (!opts.includes(fromTrimmed)) {
    throw new Error(`Option '${fromTrimmed}' not found`);
  }
  if (opts.includes(toTrimmed)) {
    throw new Error(`A column with that name already exists`);
  }

  const idx = opts.indexOf(fromTrimmed);
  const nextOptions = [...opts.slice(0, idx + 1), toTrimmed, ...opts.slice(idx + 1)];

  const entities = manifest.entities.map((e) => {
    if (e.id !== entityTypeId) return e;
    return {
      ...e,
      properties: e.properties.map((p) =>
        p.name === propName ? { ...p, options: nextOptions } : p
      ),
    };
  });

  return { ...manifest, entities };
}

/**
 * Phase 2: Collapse options and board view keys from `from` to `to` after entities use `to`.
 */
export function finalizeSelectOptionRenameInManifest(
  manifest: ProjectManifest,
  entityTypeId: string,
  propName: string,
  from: string,
  to: string
): ProjectManifest {
  const fromTrimmed = from.trim();
  const toTrimmed = to.trim();
  if (!fromTrimmed || !toTrimmed) {
    throw new Error('Old and new option names must be non-empty');
  }
  if (fromTrimmed === toTrimmed) {
    return manifest;
  }

  const entityDef = manifest.entities.find((e) => e.id === entityTypeId);
  if (!entityDef) {
    throw new Error(`Entity '${entityTypeId}' not found`);
  }

  const prop = entityDef.properties.find((p) => p.name === propName);
  if (!prop || prop.type !== 'select' || !prop.options?.length) {
    throw new Error(`Select property '${propName}' not found on entity '${entityTypeId}'`);
  }

  const opts = prop.options;
  // Idempotent: migration already merged (options no longer list the old name).
  if (!opts.includes(fromTrimmed)) {
    return manifest;
  }

  const nextOptions = opts
    .map((o) => (o === fromTrimmed ? toTrimmed : o))
    .filter((o, i, arr) => arr.indexOf(o) === i);

  if (nextOptions.length === 0) {
    throw new Error('Select options must not become empty');
  }

  const entities = manifest.entities.map((e) => {
    if (e.id !== entityTypeId) return e;
    return {
      ...e,
      properties: e.properties.map((p) =>
        p.name === propName ? { ...p, options: nextOptions } : p
      ),
    };
  });

  const views = manifest.views.map((v) => {
    if (v.type !== 'board' || v.entityId !== entityTypeId || v.groupBy !== propName) {
      return v;
    }
    const view = cloneView(v);
    view.columnOrder = mapColumnRef(view.columnOrder, fromTrimmed, toTrimmed);
    view.hiddenColumns = mapColumnRef(view.hiddenColumns, fromTrimmed, toTrimmed);
    if (view.boardDividers?.length) {
      let divChanged = false;
      const nextDividers = view.boardDividers.map((d) => {
        if (d.columnId === fromTrimmed) {
          divChanged = true;
          return { ...d, columnId: toTrimmed };
        }
        return d;
      });
      if (divChanged) {
        view.boardDividers = nextDividers;
      }
    }
    return view;
  });

  return { ...manifest, entities, views };
}
