import { Menu, MenuItem } from '@mui/material';
import type { Entity } from '../../types';

type TableContextMenuProps = {
  anchor: { x: number; y: number } | null;
  entity: Entity | null;
  onClose: () => void;
  onOpenDetail: () => void;
  onCopyTaskKey: () => void;
  onCopyDetailUrl: () => void;
};

export function TableContextMenu({
  anchor,
  entity,
  onClose,
  onOpenDetail,
  onCopyTaskKey,
  onCopyDetailUrl,
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
    </Menu>
  );
}

