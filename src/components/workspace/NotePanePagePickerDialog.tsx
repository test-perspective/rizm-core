import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import type { Entity } from '../../types';
import { sortWikiTreeOrder } from '../wiki/wikiTreeHelpers';

type NotePanePagePickerDialogProps = {
  open: boolean;
  pages: Entity[];
  /** Board/table view id the pane is being opened for (required when confirming). */
  targetViewId: string | null;
  onClose: () => void;
  onConfirm: (pageId: string, targetViewId: string) => void;
};

/**
 * Pick a wiki page to show in the board/table notes pane (REQ-288).
 */
export function NotePanePagePickerDialog({
  open,
  pages,
  targetViewId,
  onClose,
  onConfirm,
}: NotePanePagePickerDialogProps) {
  const sorted = sortWikiTreeOrder(pages);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Open notes pane</DialogTitle>
      <DialogContent dividers>
        {sorted.length === 0 ? (
          <p className="text-sm text-zinc-500">No wiki pages in this project.</p>
        ) : (
          <List dense disablePadding data-testid="note-pane-page-picker-list">
            {sorted.map((p) => {
              const title =
                (typeof p.properties?.title === 'string' && p.properties.title.trim()) || 'Untitled';
              return (
                <ListItemButton
                  key={p.id}
                  onClick={() => {
                    if (targetViewId) onConfirm(p.id, targetViewId);
                    onClose();
                  }}
                >
                  <ListItemText primary={title} secondary={p.id} secondaryTypographyProps={{ className: 'font-mono text-xs' }} />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
