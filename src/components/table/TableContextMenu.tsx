import { Menu, MenuItem } from '@mui/material';
import type { Entity } from '../../types';

type TableContextMenuProps = {
  anchor: { x: number; y: number } | null;
  entity: Entity | null;
  onClose: () => void;
  onOpenDetail: () => void;
  onCopyTaskKey: () => void;
  onCopyDetailUrl: () => void;
  /** Absent when no move handler is available (e.g. outside the workspace). */
  onMoveToProject?: () => void;
  /** How many tasks the move would cover, from the current cell selection. */
  moveTargetCount?: number;
};

export function TableContextMenu({
  anchor,
  entity,
  onClose,
  onOpenDetail,
  onCopyTaskKey,
  onCopyDetailUrl,
  onMoveToProject,
  moveTargetCount = 0,
}: TableContextMenuProps) {
  return (
    <Menu
      open={anchor !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        anchor !== null
          ? { top: anchor.y, left: anchor.x }
          : undefined
      }
      sx={{
        '& .MuiPaper-root': {
          bgcolor: 'rgb(24 24 27)',
          color: 'rgb(244 244 245)',
          border: '1px solid rgb(39 39 42)',
        },
        '& .MuiMenuItem-root': {
          fontSize: '0.875rem',
        },
        '& .MuiMenuItem-root:hover': {
          bgcolor: 'rgb(39 39 42)',
        },
      }}
    >
      <MenuItem onClick={onOpenDetail} disabled={!entity}>
        Open detail
      </MenuItem>
      <MenuItem
        onClick={onCopyTaskKey}
        disabled={
          !entity ||
          !String(entity.properties?.taskKey ?? '').trim()
        }
      >
        Copy task key
      </MenuItem>
      <MenuItem onClick={onCopyDetailUrl} disabled={!entity}>
        Copy detail URL
      </MenuItem>
      {onMoveToProject && (
        <MenuItem
          onClick={onMoveToProject}
          disabled={moveTargetCount === 0}
          data-testid="table-context-move-to-project"
        >
          {moveTargetCount > 1
            ? `Move to project… (${moveTargetCount} tasks)`
            : 'Move to project…'}
        </MenuItem>
      )}
    </Menu>
  );
}

