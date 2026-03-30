import { useCallback, useState } from 'react';
import { GridRow } from '@mui/x-data-grid-premium';
import type { GridRowProps } from '@mui/x-data-grid-premium';
import type { Entity, ViewConfig } from '../../types';

type UseTableContextMenuParams = {
  entities: Entity[];
  view: ViewConfig;
  projectId: string;
  onEntityClick?: (entity: Entity) => void;
};

function buildDetailPath(projectId: string, viewId: string, entityId: string): string {
  return `/p/${encodeURIComponent(projectId)}/v/${encodeURIComponent(viewId)}/e/${encodeURIComponent(entityId)}`;
}

export function useTableContextMenu({
  entities,
  view,
  projectId,
  onEntityClick,
}: UseTableContextMenuParams) {
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuEntity, setContextMenuEntity] = useState<Entity | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenuAnchor(null);
    setContextMenuEntity(null);
  }, []);

  const RowWithContextMenu = useCallback(
    (props: GridRowProps) => {
      const entity = entities.find((e) => e.id === props.rowId);
      const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenuAnchor({ x: e.clientX, y: e.clientY });
        setContextMenuEntity(entity ?? null);
      };
      return <GridRow {...props} onContextMenu={handleContextMenu} />;
    },
    [entities]
  );

  const handleCopyTaskKey = useCallback(async () => {
    if (!contextMenuEntity) return;
    const taskKey = typeof contextMenuEntity.properties?.taskKey === 'string' ? contextMenuEntity.properties.taskKey.trim() : '';
    if (!taskKey) return;
    try {
      await navigator.clipboard.writeText(taskKey);
    } catch {
      try {
        await navigator.clipboard.writeText(taskKey);
      } catch {
        // ignore
      }
    }
    closeContextMenu();
  }, [contextMenuEntity, closeContextMenu]);

  const handleCopyDetailUrl = useCallback(async () => {
    if (!contextMenuEntity) return;
    const path = buildDetailPath(projectId, view.id, contextMenuEntity.id);
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // ignore
      }
    }
    closeContextMenu();
  }, [contextMenuEntity, projectId, view.id, closeContextMenu]);

  const handleContextMenuOpenDetail = useCallback(() => {
    if (contextMenuEntity && onEntityClick) {
      onEntityClick(contextMenuEntity);
    }
    closeContextMenu();
  }, [contextMenuEntity, onEntityClick, closeContextMenu]);

  return {
    contextMenuAnchor,
    contextMenuEntity,
    closeContextMenu,
    RowWithContextMenu,
    handleCopyTaskKey,
    handleCopyDetailUrl,
    handleContextMenuOpenDetail,
  };
}

