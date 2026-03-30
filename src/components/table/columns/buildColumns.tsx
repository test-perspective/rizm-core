import type { Entity, PropertyDefinition, UserSummary, ViewConfig } from '../../../types';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid-premium';
import type { TableRow } from '../types';
import { getLatestCommentDoc, normalizeComments } from '../../../utils/comments';
import { richTextPreview, formatDateTime } from '../richtextPreview';
import { buildColumnForProperty } from './buildColumnForProperty';

type BuildColumnsArgs = {
  orderedProps: PropertyDefinition[];
  savedWidths: Record<string, number>;
  savedColumnOrder: string[] | null;
  view: ViewConfig;
  allEntities: Entity[];
  onEntityClick?: (entity: Entity) => void;
  usersById: Record<string, UserSummary>;
  onResolveUsers?: (userIds: string[]) => void;
  onUpsertPropertyOption: (entityTypeId: string, propName: string, option: string) => void;
};

export const buildColumns = ({
  orderedProps,
  savedWidths,
  savedColumnOrder,
  view,
  allEntities,
  onEntityClick,
  usersById,
  onResolveUsers,
  onUpsertPropertyOption,
}: BuildColumnsArgs): GridColDef<TableRow>[] => {
  const cols: GridColDef<TableRow>[] = orderedProps.map((prop) =>
    buildColumnForProperty({
      prop,
      orderedProps,
      savedWidths,
      view,
      allEntities,
      onEntityClick,
      usersById,
      onResolveUsers,
      onUpsertPropertyOption,
    })
  );

  if (view.entityId === 'task') {
    const savedLatestCommentWidth = savedWidths['__latestComment'];
    cols.push({
      field: '__latestComment',
      headerName: 'Latest Comment',
      minWidth: 320,
      ...(savedLatestCommentWidth ? { width: savedLatestCommentWidth, flex: undefined } : { flex: 1 }),
      editable: false,
      sortable: false,
      filterable: false,
      hideable: true,
      valueGetter: (_value, row) => {
        const raw = (row as any)?.comments;
        const latestDoc = getLatestCommentDoc(normalizeComments(raw));
        return richTextPreview(latestDoc, 80) || '';
      },
      valueFormatter: (value) => richTextPreview(value, 80) || '',
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        const raw = (params.row as any)?.comments;
        const latestDoc = getLatestCommentDoc(normalizeComments(raw));
        const preview = richTextPreview(latestDoc, 80);
        if (!preview) return <span className="text-zinc-500">—</span>;
        return (
          <span className="text-zinc-300" title={preview}>
            {preview}
          </span>
        );
      },
    });
  }

  cols.push(
    {
      field: '__createdAt',
      headerName: 'createdAt',
      type: 'number',
      editable: false,
      sortable: true,
      filterable: true,
      hideable: true,
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        return <span className="text-zinc-300">{formatDateTime(Number(params.value))}</span>;
      },
    },
    {
      field: '__updatedAt',
      headerName: 'updatedAt',
      type: 'number',
      editable: false,
      sortable: true,
      filterable: true,
      hideable: true,
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        return <span className="text-zinc-300">{formatDateTime(Number(params.value))}</span>;
      },
    },
    {
      field: '__id',
      headerName: 'id',
      type: 'string',
      editable: false,
      sortable: true,
      filterable: true,
      hideable: true,
      renderCell: (params: GridRenderCellParams<TableRow, unknown>) => {
        return <span className="text-zinc-300">{String(params.value ?? '')}</span>;
      },
    }
  );

  if (savedColumnOrder && savedColumnOrder.length > 0) {
    const fieldToCol = new Map<string, GridColDef<TableRow>>();
    cols.forEach((col) => fieldToCol.set(col.field, col));

    const orderedCols: GridColDef<TableRow>[] = [];
    const processedFields = new Set<string>();

    for (const field of savedColumnOrder) {
      const col = fieldToCol.get(field);
      if (col) {
        orderedCols.push(col);
        processedFields.add(field);
      }
    }

    for (const col of cols) {
      if (!processedFields.has(col.field)) {
        orderedCols.push(col);
      }
    }

    return orderedCols;
  }

  return cols;
};
