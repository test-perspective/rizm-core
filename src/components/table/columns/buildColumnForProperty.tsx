import type { Entity, PropertyDefinition, UserSummary, ViewConfig } from '../../../types';
import {
  GridColDef,
  GridRenderCellParams,
  GridRenderEditCellParams,
} from '@mui/x-data-grid-premium';
import type { TableRow } from '../types';
import { UserAvatar } from '../../UserAvatar';
import { DELETED_USER_LABEL, getUserDisplayName } from '../../../utils/userDisplay';
import { richTextPreview } from '../richtextPreview';
import { SelectPill } from '../cells/SelectPill';
import { DateEditCell } from '../cells/DateEditCell';
import { UserEditCell } from '../cells/UserEditCell';
import { LabelsEditCell } from '../cells/LabelsEditCell';
import { TagPill } from '../../common/TagPill';
import { normalizeLinkTaskKeys } from './utils';
import {
  parseLabelsValue,
  formatLabelsValue,
  getLabelsGroupingValue,
  isEmptyLabelToken,
  EMPTY_LABEL_GROUP_VALUE,
} from './buildColumnsLabelsUtils';
import { compareTaskKeyForSort } from './taskKeySort';

export type BuildColumnForPropertyArgs = {
  prop: PropertyDefinition;
  orderedProps: PropertyDefinition[];
  savedWidths: Record<string, number>;
  view: ViewConfig;
  allEntities: Entity[];
  onEntityClick?: (entity: Entity) => void;
  usersById: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => void;
};

export function buildColumnForProperty(args: BuildColumnForPropertyArgs): GridColDef<TableRow> {
  const {
    prop,
    orderedProps,
    savedWidths,
    view,
    allEntities,
    onEntityClick,
    usersById,
    onResolveUsers,
    onUpsertPropertyOption,
  } = args;

  const savedWidth = savedWidths[prop.name];
  const isTitle = prop.name === 'title';

  let flexValue: number | undefined = undefined;
  let widthValue: number | undefined = undefined;

  if (savedWidth) {
    widthValue = savedWidth;
    flexValue = undefined;
  } else if (isTitle) {
    flexValue = 2;
    widthValue = undefined;
  } else {
    flexValue = 0;
    widthValue = undefined;
  }

  const common: GridColDef<TableRow> = {
    field: prop.name,
    headerName: prop.name,
    minWidth: prop.name === orderedProps[0]?.name ? 260 : 160,
    ...(widthValue ? { width: widthValue } : {}),
    ...(flexValue !== undefined ? { flex: flexValue } : {}),
    editable: prop.name !== 'taskKey',
    sortable: true,
    filterable: true,
    hideable: true,
  };

  if (prop.name === 'taskKey') {
    return {
      ...common,
      minWidth: 130,
      flex: 0,
      editable: false,
      type: 'string',
      sortComparator: (v1, v2) => compareTaskKeyForSort(v1, v2),
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined || v === '') return <span className="text-zinc-500">—</span>;
        const rowId = (params.row as TableRow).__rowId;
        const entity = allEntities.find((e) => e.id === rowId);
        const canOpen = entity && onEntityClick;
        const handleClick = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (entity && onEntityClick) onEntityClick(entity);
        };
        if (canOpen) {
          return (
            <button
              type="button"
              onClick={handleClick}
              className="text-zinc-300 font-mono text-xs text-left w-full hover:text-violet-300 hover:underline cursor-pointer"
              title={`Open: ${String(v)}`}
            >
              {String(v)}
            </button>
          );
        }
        return <span className="text-zinc-300 font-mono text-xs">{String(v)}</span>;
      },
    };
  }

  if (prop.type === 'richtext') {
    return {
      ...common,
      editable: false,
      type: 'string',
      valueFormatter: (value) => richTextPreview(value, 80) || '',
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        const preview = richTextPreview(v, 80);
        if (!preview) return <span className="text-zinc-500">—</span>;
        return (
          <span className="text-zinc-300" title={preview}>
            {preview}
          </span>
        );
      },
    };
  }

  if (prop.type === 'select') {
    return {
      ...common,
      type: 'singleSelect',
      valueOptions: prop.options ?? [],
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined || v === '') return <span className="text-zinc-500">—</span>;
        return (
          <span>
            <SelectPill value={String(v)} />
          </span>
        );
      },
    };
  }

  if (prop.type === 'labels') {
    return {
      ...common,
      type: 'string',
      valueGetter: (_value, row) => formatLabelsValue((row as Record<string, unknown>)[prop.name]),
      groupingValueGetter: (value) => getLabelsGroupingValue(value),
      sortComparator: (v1, v2) => {
        const left = String(v1 ?? '').trim();
        const right = String(v2 ?? '').trim();
        const leftIsEmptyGroup = left === '' || left === EMPTY_LABEL_GROUP_VALUE;
        const rightIsEmptyGroup = right === '' || right === EMPTY_LABEL_GROUP_VALUE;

        if (leftIsEmptyGroup && !rightIsEmptyGroup) return 1;
        if (!leftIsEmptyGroup && rightIsEmptyGroup) return -1;
        return left.localeCompare(right, undefined, { sensitivity: 'base' });
      },
      pastedValueParser: (value) => parseLabelsValue(value),
      valueFormatter: (value) => formatLabelsValue(value),
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const isGroupRow = (params as GridRenderCellParams<TableRow, unknown> & {
          rowNode?: { type?: string };
        }).rowNode?.type === 'group';
        const v = isGroupRow ? params.value : (params.row as Record<string, unknown>)[prop.name];
        const labels = parseLabelsValue(v);
        if (labels.length === 0 || labels.every(isEmptyLabelToken)) {
          return <span className="text-zinc-500">—</span>;
        }
        return (
          <div className="flex items-center gap-1 flex-nowrap overflow-hidden w-full min-w-0">
            {labels.filter((label) => !isEmptyLabelToken(label)).map((label) => (
              <span key={label} className="shrink-0">
                <TagPill value={label} />
              </span>
            ))}
          </div>
        );
      },
      renderEditCell: (params: GridRenderEditCellParams) => (
        <LabelsEditCell
          {...params}
          value={(params.row as Record<string, unknown>)[prop.name]}
          options={prop.options ?? []}
          entityTypeId={view.entityId}
          onUpsertPropertyOption={onUpsertPropertyOption}
        />
      ),
    };
  }

  if (prop.type === 'number') {
    return {
      ...common,
      type: 'number',
      valueParser: (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined || Number.isNaN(v)) return <span className="text-zinc-500">—</span>;
        return <span className="text-zinc-300">{String(v)}</span>;
      },
    };
  }

  if (prop.type === 'boolean') {
    return {
      ...common,
      type: 'boolean',
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined) return <span className="text-zinc-500">—</span>;
        return <span className="text-zinc-300">{v ? 'true' : 'false'}</span>;
      },
    };
  }

  if (prop.type === 'date') {
    const formatDateDisplay = (v: unknown): string => {
      if (v == null || v === '') return '';
      if (typeof v === 'number') {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
      }
      return String(v);
    };
    return {
      ...common,
      type: 'string',
      valueFormatter: (value) => formatDateDisplay(value),
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined || v === '') return <span className="text-zinc-500">—</span>;
        return <span className="text-zinc-300">{formatDateDisplay(v)}</span>;
      },
      renderEditCell: (params: GridRenderEditCellParams) => <DateEditCell {...params} />,
      valueParser: (v) => {
        if (v == null || v === '') return '';
        if (typeof v === 'number') {
          const d = new Date(v);
          return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
        }
        return String(v).trim();
      },
    };
  }

  if (prop.type === 'link') {
    return {
      ...common,
      editable: false,
      type: 'string',
      valueFormatter: (value) => normalizeLinkTaskKeys(value).join(', '),
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined || v === '') return <span className="text-zinc-500">—</span>;

        const taskKeys = normalizeLinkTaskKeys(v);
        if (taskKeys.length === 0) return <span className="text-zinc-500">—</span>;

        return (
          <div className="flex flex-wrap gap-1">
            {taskKeys.map((taskKey) => {
              const linkedEntity = allEntities.find((e) => {
                const tk = typeof e.properties?.taskKey === 'string' ? e.properties.taskKey.trim() : '';
                return tk === taskKey;
              });

              const handleClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (linkedEntity && onEntityClick) {
                  onEntityClick(linkedEntity);
                }
              };

              return (
                <button
                  key={taskKey}
                  type="button"
                  onClick={handleClick}
                  className={`font-mono text-xs ${
                    linkedEntity
                      ? 'text-violet-400 hover:text-violet-300 hover:underline cursor-pointer'
                      : 'text-zinc-500 line-through cursor-default'
                  }`}
                  title={linkedEntity ? `Click to open: ${taskKey}` : `Deleted entity: ${taskKey}`}
                >
                  {taskKey}
                </button>
              );
            })}
          </div>
        );
      },
    };
  }

  if (prop.type === 'user') {
    return {
      ...common,
      type: 'string',
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const v = params.value;
        if (v === null || v === undefined || v === '') return <span className="text-zinc-500">—</span>;
        const userId = typeof v === 'string' ? v.trim() : '';
        if (!userId) return <span className="text-zinc-500">—</span>;
        const user = usersById[userId];
        if (!user) {
          return (
            <span className="text-zinc-500 text-xs" title={`User ID: ${userId}`}>
              {DELETED_USER_LABEL}
            </span>
          );
        }
        const displayName = getUserDisplayName(user.email);
        return (
          <div className="flex items-center gap-2" title={user.email}>
            <UserAvatar email={user.email} size="sm" />
            <span className="text-zinc-300 truncate">{displayName}</span>
          </div>
        );
      },
      renderEditCell: (params: GridRenderEditCellParams) => (
        <UserEditCell {...params} usersById={usersById} onResolveUsers={onResolveUsers} />
      ),
    };
  }

  return {
    ...common,
    type: 'string',
    renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
      const v = params.value;
      if (v === null || v === undefined || v === '') return <span className="text-zinc-500">—</span>;
      return <span className="text-zinc-300">{String(v)}</span>;
    },
  };
}
