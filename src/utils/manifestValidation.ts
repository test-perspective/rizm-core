import { BoardDivider, EntityDefinition, ProjectManifest, PropertyDefinition, ViewConfig } from '../types';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const asString = (v: unknown, path: string): string => {
  if (typeof v !== 'string') throw new Error(`${path} must be a string`);
  if (!v.trim()) throw new Error(`${path} must not be empty`);
  return v;
};

const asOptionalString = (v: unknown, path: string): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new Error(`${path} must be a string`);
  if (!v.trim()) return undefined;
  return v;
};

const asStringArray = (v: unknown, path: string): string[] => {
  if (!Array.isArray(v)) throw new Error(`${path} must be an array`);
  const out: string[] = [];
  v.forEach((x, i) => {
    if (typeof x !== 'string' || !x.trim()) throw new Error(`${path}[${i}] must be a non-empty string`);
    out.push(x);
  });
  return out;
};

export const parseProjectManifest = (v: unknown): ProjectManifest => {
  if (!isRecord(v)) throw new Error('manifest must be an object');

  const name = asString(v.name, 'manifest.name');
  const defaultView = asString(v.defaultView, 'manifest.defaultView');

  if (!Array.isArray(v.entities)) throw new Error('manifest.entities must be an array');
  const entities: EntityDefinition[] = v.entities.map((e, i) => parseEntity(e, `manifest.entities[${i}]`));
  const entityIds = new Set(entities.map((e) => e.id));
  if (entityIds.size !== entities.length) throw new Error('manifest.entities contains duplicate id');

  if (!Array.isArray(v.views)) throw new Error('manifest.views must be an array');
  const views: ViewConfig[] = v.views.map((view, i) => parseView(view, `manifest.views[${i}]`));

  const viewIds = new Set(views.map((x) => x.id));
  if (!viewIds.has(defaultView)) throw new Error('manifest.defaultView must match an existing views[].id');

  for (const view of views) {
    if (!entityIds.has(view.entityId)) {
      throw new Error(`view '${view.id}' references unknown entityId '${view.entityId}'`);
    }
    const entity = entities.find((e) => e.id === view.entityId);
    const propNames = new Set((entity?.properties ?? []).map((p) => p.name));

    for (const vp of view.visibleProperties) {
      if (!propNames.has(vp)) {
        throw new Error(`view '${view.id}' references unknown property '${vp}'`);
      }
    }

    if (view.sortBy) {
      const builtins = new Set(['createdAt', 'updatedAt', 'id']);
      if (!builtins.has(view.sortBy) && !propNames.has(view.sortBy)) {
        throw new Error(`view '${view.id}' sortBy '${view.sortBy}' references unknown property`);
      }
    }

    if (view.type === 'board') {
      if (!view.groupBy) throw new Error(`board view '${view.id}' requires groupBy`);
      if (!propNames.has(view.groupBy)) throw new Error(`board view '${view.id}' groupBy '${view.groupBy}' not found`);
      const p = entity?.properties.find((x) => x.name === view.groupBy);
      if (p?.type !== 'select') throw new Error(`board view '${view.id}' groupBy '${view.groupBy}' must be select`);
    }
  }

  return {
    name,
    entities,
    views,
    defaultView,
  };
};

const parseEntity = (v: unknown, path: string): EntityDefinition => {
  if (!isRecord(v)) throw new Error(`${path} must be an object`);
  const id = asString(v.id, `${path}.id`);
  const name = asString(v.name, `${path}.name`);
  const namePlural = asString(v.namePlural, `${path}.namePlural`);
  const defaultView = asOptionalString(v.defaultView, `${path}.defaultView`);

  if (!Array.isArray(v.properties)) throw new Error(`${path}.properties must be an array`);
  const properties: PropertyDefinition[] = v.properties.map((p, i) => parseProperty(p, `${path}.properties[${i}]`));
  const propNames = new Set(properties.map((p) => p.name));
  if (propNames.size !== properties.length) throw new Error(`${path}.properties contains duplicate name`);

  const titleLikeProperty = asOptionalString(v.titleLikeProperty, `${path}.titleLikeProperty`);
  if (titleLikeProperty !== undefined && !propNames.has(titleLikeProperty)) {
    throw new Error(`${path}.titleLikeProperty '${titleLikeProperty}' must reference an existing property name`);
  }

  return {
    id,
    name,
    namePlural,
    properties,
    defaultView: defaultView ?? undefined,
    titleLikeProperty: titleLikeProperty ?? undefined,
  };
};

const parseProperty = (v: unknown, path: string): PropertyDefinition => {
  if (!isRecord(v)) throw new Error(`${path} must be an object`);
  const name = asString(v.name, `${path}.name`);
  const type = asString(v.type, `${path}.type`);
  if (
    type !== 'text' &&
    type !== 'richtext' &&
    type !== 'select' &&
    type !== 'labels' &&
    type !== 'number' &&
    type !== 'date' &&
    type !== 'boolean' &&
    type !== 'link' &&
    type !== 'user'
  ) {
    throw new Error(`${path}.type must be one of text|richtext|select|labels|number|date|boolean|link|user`);
  }
  const visible = v.visible;
  if (visible !== undefined && visible !== null && typeof visible !== 'boolean') {
    throw new Error(`${path}.visible must be boolean`);
  }
  const options = v.options;
  if (type === 'select') {
    const opts = asStringArray(options, `${path}.options`);
    if (opts.length === 0) throw new Error(`${path}.options must not be empty`);
    return { name, type, options: opts, visible: visible ?? undefined };
  }
  if (type === 'labels') {
    if (options === undefined || options === null) {
      return { name, type, visible: visible ?? undefined };
    }
    const opts = asStringArray(options, `${path}.options`);
    return { name, type, options: opts, visible: visible ?? undefined };
  }
  if (options !== undefined && options !== null) {
    // Prevent accidental shape mismatch (e.g. select options on non-select types)
    if (!Array.isArray(options)) throw new Error(`${path}.options must be an array when provided`);
  }
  return { name, type, visible: visible ?? undefined };
};

const parseView = (v: unknown, path: string): ViewConfig => {
  if (!isRecord(v)) throw new Error(`${path} must be an object`);
  const id = asString(v.id, `${path}.id`);
  const name = asString(v.name, `${path}.name`);
  const type = asString(v.type, `${path}.type`);
  if (type === 'list') {
    throw new Error(`${path}.type: 'list' is deprecated and no longer supported. Use 'table' instead.`);
  }
  if (type !== 'board' && type !== 'table' && type !== 'wiki') {
    throw new Error(`${path}.type must be one of board|table|wiki`);
  }
  const entityId = asString((v as any).entityId, `${path}.entityId`);
  const groupBy = asOptionalString(v.groupBy, `${path}.groupBy`);
  const visibleProperties = asStringArray(v.visibleProperties, `${path}.visibleProperties`);
  const sortBy = asOptionalString(v.sortBy, `${path}.sortBy`);
  const sortOrder = v.sortOrder;
  if (sortOrder !== undefined && sortOrder !== null && sortOrder !== 'asc' && sortOrder !== 'desc') {
    throw new Error(`${path}.sortOrder must be 'asc'|'desc'`);
  }

  // Parse optional columnOrder and hiddenColumns
  const columnOrder = v.columnOrder;
  let parsedColumnOrder: string[] | undefined = undefined;
  if (columnOrder !== undefined && columnOrder !== null) {
    if (!Array.isArray(columnOrder)) {
      throw new Error(`${path}.columnOrder must be an array`);
    }
    parsedColumnOrder = columnOrder.map((x, i) => {
      if (typeof x !== 'string' || !x.trim()) {
        throw new Error(`${path}.columnOrder[${i}] must be a non-empty string`);
      }
      return x.trim();
    });
  }

  const hiddenColumns = v.hiddenColumns;
  let parsedHiddenColumns: string[] | undefined = undefined;
  if (hiddenColumns !== undefined && hiddenColumns !== null) {
    if (!Array.isArray(hiddenColumns)) {
      throw new Error(`${path}.hiddenColumns must be an array`);
    }
    parsedHiddenColumns = hiddenColumns.map((x, i) => {
      if (typeof x !== 'string' || !x.trim()) {
        throw new Error(`${path}.hiddenColumns[${i}] must be a non-empty string`);
      }
      return x.trim();
    });
  }

  const boardDividers = v.boardDividers;
  let parsedBoardDividers: BoardDivider[] | undefined = undefined;
  if (boardDividers !== undefined && boardDividers !== null) {
    if (!Array.isArray(boardDividers)) {
      throw new Error(`${path}.boardDividers must be an array`);
    }
    parsedBoardDividers = boardDividers.map((d, i) => parseBoardDivider(d, `${path}.boardDividers[${i}]`));
  }

  return {
    id,
    name,
    type,
    entityId,
    groupBy: groupBy ?? undefined,
    visibleProperties,
    sortBy: sortBy ?? undefined,
    sortOrder: (sortOrder ?? undefined) as any,
    columnOrder: parsedColumnOrder,
    hiddenColumns: parsedHiddenColumns,
    boardDividers: parsedBoardDividers,
  };
};

const parseBoardDivider = (v: unknown, path: string): BoardDivider => {
  if (!isRecord(v)) throw new Error(`${path} must be an object`);
  const id = asString(v.id, `${path}.id`);
  const title = asString(v.title, `${path}.title`);
  const columnId = asString(v.columnId, `${path}.columnId`);
  const afterId = asOptionalString(v.afterId, `${path}.afterId`);
  const sort = v.sort;
  let parsedSort: number | undefined = undefined;
  if (sort !== undefined && sort !== null) {
    if (typeof sort !== 'number' || !Number.isFinite(sort)) {
      throw new Error(`${path}.sort must be a finite number`);
    }
    parsedSort = sort;
  }

  return {
    id,
    title,
    columnId,
    afterId: afterId ?? undefined,
    sort: parsedSort,
  };
};

