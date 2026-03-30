import { useCallback, useMemo, useState, useEffect } from 'react';
import type { GridColumnVisibilityModel, GridFilterModel, GridPaginationModel } from '@mui/x-data-grid-premium';
import type { MutableRefObject } from 'react';
import type { TableRow } from './types';
import type { PropertyDefinition, ViewConfig } from '../../types';
import { fetchProjectsIndex } from '../../api/projects';
import { getColumnWidths, setColumnWidth, getColumnOrder, setColumnOrder } from '../../utils/tableColumnPrefs';
import { getColumnVisibility, setColumnVisibility } from '../../utils/tableColumnVisibilityPrefs';
import { clampPage, getPageAfterFilterChange } from './paginationUtils';
import { builtinFieldMap } from './tableViewTypes';
import { buildColumns } from './columns/buildColumns';
import type { Entity, UserSummary } from '../../types';

export type UseTableViewStateArgs = {
  projectId: string;
  view: ViewConfig;
  properties: PropertyDefinition[];
  entities: Entity[];
  allEntities: Entity[];
  onEntityClick?: (entity: Entity) => void;
  usersById: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => void;
  apiRef: MutableRefObject<unknown>;
};

export function useTableViewState({
  projectId,
  view,
  properties,
  entities,
  allEntities,
  onEntityClick,
  usersById,
  onResolveUsers,
  onUpsertPropertyOption,
  apiRef,
}: UseTableViewStateArgs) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const [lastReloadSignature, setLastReloadSignature] = useState<string | null>(null);
  const [pendingReload, setPendingReload] = useState(false);
  const [reloadCompletedAt, setReloadCompletedAt] = useState(0);
  const [latestProjectUpdatedAt, setLatestProjectUpdatedAt] = useState<number | null>(null);
  const [lastReloadProjectUpdatedAt, setLastReloadProjectUpdatedAt] = useState<number | null>(null);

  const initialVisibilityModel = useMemo(() => {
    const saved = getColumnVisibility(projectId, view.id);
    if (saved) return saved;
    const model: GridColumnVisibilityModel = {};
    for (const prop of properties) {
      model[prop.name] = view.visibleProperties.includes(prop.name);
    }
    model.__createdAt = false;
    model.__updatedAt = false;
    model.__id = false;
    if (view.entityId === 'task') {
      model.__latestComment = true;
    }
    return model;
  }, [projectId, view.id, view.visibleProperties, view.entityId, properties]);

  const [columnVisibilityModel, setColumnVisibilityModelState] = useState<GridColumnVisibilityModel>(initialVisibilityModel);

  useEffect(() => {
    const saved = getColumnVisibility(projectId, view.id);
    if (saved) {
      setColumnVisibilityModelState(saved);
    } else {
      const model: GridColumnVisibilityModel = {};
      for (const prop of properties) {
        model[prop.name] = view.visibleProperties.includes(prop.name);
      }
      model.__createdAt = false;
      model.__updatedAt = false;
      model.__id = false;
      if (view.entityId === 'task') {
        model.__latestComment = true;
      }
      setColumnVisibilityModelState(model);
    }
  }, [projectId, view.id, view.visibleProperties, view.entityId, properties]);

  const orderedProps = useMemo(() => {
    const idx = properties.findIndex((p) => p.name === 'taskKey');
    if (idx <= 0) return properties;
    const copy = [...properties];
    const [tk] = copy.splice(idx, 1);
    copy.unshift(tk);
    return copy;
  }, [properties]);

  const rows: TableRow[] = useMemo(() => {
    return entities.map((e) => ({
      __rowId: e.id,
      __createdAt: e.createdAt,
      __updatedAt: e.updatedAt,
      __id: e.id,
      ...e.properties,
    }));
  }, [entities]);

  const entitiesSignature = useMemo(() => {
    if (entities.length === 0) return '';
    return entities.map((e) => `${e.id}:${e.updatedAt}`).join('|');
  }, [entities]);

  useEffect(() => {
    if (lastReloadSignature === null) {
      setLastReloadSignature(entitiesSignature);
    }
  }, [entitiesSignature, lastReloadSignature]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const index = await fetchProjectsIndex();
        if (cancelled) return;
        const meta = index.projects.find((p) => p.id === projectId);
        if (!meta) return;
        setLatestProjectUpdatedAt(meta.updatedAt);
        if (lastReloadProjectUpdatedAt === null) {
          setLastReloadProjectUpdatedAt(meta.updatedAt);
        }
      } catch {
        // Ignore polling errors
      }
    };
    tick();
    const timer = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, lastReloadProjectUpdatedAt]);

  const reloadEnabled = useMemo(() => {
    if (pendingReload) return false;
    if (latestProjectUpdatedAt === null || lastReloadProjectUpdatedAt === null) return false;
    return latestProjectUpdatedAt > lastReloadProjectUpdatedAt;
  }, [pendingReload, latestProjectUpdatedAt, lastReloadProjectUpdatedAt]);

  const hasFilters = filterModel.items && filterModel.items.length > 0;
  const filteredCount = useMemo(() => {
    if (!hasFilters) return rows.length;
    const api = apiRef.current as { getAllRowIds?: () => unknown[]; getFilterState?: (m: GridFilterModel) => { filteredRowsLookup?: Record<string, boolean> } } | null;
    const rowIds = api?.getAllRowIds?.();
    const filterState = api?.getFilterState?.(filterModel);
    if (!rowIds || !filterState?.filteredRowsLookup) return rows.length;
    return rowIds.filter((rowId) => filterState.filteredRowsLookup![String(rowId)] !== false).length;
  }, [hasFilters, filterModel, rows.length]);

  useEffect(() => {
    const nextPage = clampPage(page, filteredCount, rowsPerPage);
    if (nextPage !== page) setPage(nextPage);
  }, [page, filteredCount, rowsPerPage]);

  const initialColumnWidths = useMemo(() => getColumnWidths(projectId, view.id), [projectId, view.id]);
  const [columnWidths, setColumnWidthsState] = useState<Record<string, number>>(initialColumnWidths);
  const savedColumnOrder = useMemo(() => getColumnOrder(projectId, view.id) ?? null, [projectId, view.id]);

  useEffect(() => {
    setColumnWidthsState(getColumnWidths(projectId, view.id));
  }, [projectId, view.id]);

  const columns = useMemo(
    () =>
      buildColumns({
        orderedProps,
        savedWidths: columnWidths,
        savedColumnOrder,
        view,
        allEntities,
        onEntityClick,
        usersById,
        onResolveUsers,
        onUpsertPropertyOption,
      }),
    [
      orderedProps,
      columnWidths,
      savedColumnOrder,
      view,
      allEntities,
      onEntityClick,
      usersById,
      onResolveUsers,
      onUpsertPropertyOption,
    ]
  );

  const sortModel = useMemo(() => {
    if (!view.sortBy) return [];
    const isBuiltin = view.sortBy === 'createdAt' || view.sortBy === 'updatedAt' || view.sortBy === 'id';
    const field = isBuiltin
      ? (builtinFieldMap[view.sortBy as 'createdAt' | 'updatedAt' | 'id'] as string)
      : view.sortBy;
    const sort = view.sortOrder ?? 'asc';
    return [{ field, sort }];
  }, [view.sortBy, view.sortOrder]);

  const handleColumnVisibilityModelChange = useCallback(
    (newModel: GridColumnVisibilityModel) => {
      setColumnVisibilityModelState(newModel);
      setColumnVisibility(projectId, view.id, newModel);
    },
    [projectId, view.id]
  );

  const handleColumnOrderChange = useCallback(() => {
    const api = apiRef.current as { getAllColumns?: () => { field: string }[] } | null;
    if (api?.getAllColumns) {
      const newOrder = api.getAllColumns().map((col) => col.field);
      setColumnOrder(projectId, view.id, newOrder);
    }
  }, [apiRef, projectId, view.id]);

  const handlePaginationModelChange = useCallback(
    (model: GridPaginationModel) => {
      setPage(model.page);
      if (model.pageSize !== rowsPerPage) {
        setRowsPerPage(model.pageSize);
      }
    },
    [rowsPerPage]
  );

  const handleFilterModelChange = useCallback(
    (model: GridFilterModel) => {
      setFilterModel(model);
      setPage(getPageAfterFilterChange(rows.length, rowsPerPage));
    },
    [rows.length, rowsPerPage]
  );

  const handleColumnWidthChange = useCallback(
    (field: string, width: number) => {
      if (!field || width <= 0) return;
      setColumnWidthsState((prev) => {
        if (prev[field] === width) return prev;
        return { ...prev, [field]: width };
      });
      setColumnWidth(projectId, view.id, field, width);
    },
    [projectId, view.id]
  );

  useEffect(() => {
    if (!pendingReload) return;
    if (reloadCompletedAt === 0) return;
    setLastReloadSignature(entitiesSignature);
    setPendingReload(false);
    setReloadCompletedAt(0);
    if (latestProjectUpdatedAt !== null) {
      setLastReloadProjectUpdatedAt(latestProjectUpdatedAt);
    }
  }, [pendingReload, reloadCompletedAt, entitiesSignature, latestProjectUpdatedAt]);

  return {
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    filterModel,
    columnVisibilityModel,
    columnWidths,
    setColumnWidthsState,
    setPendingReload,
    setReloadCompletedAt,
    reloadEnabled,
    filteredCount,
    rows,
    columns,
    sortModel,
    savedColumnOrder,
    handleColumnVisibilityModelChange,
    handleColumnOrderChange,
    handlePaginationModelChange,
    handleFilterModelChange,
    handleColumnWidthChange,
  };
}
