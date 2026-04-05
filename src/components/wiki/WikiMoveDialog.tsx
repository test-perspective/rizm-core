import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';

import { fetchProjectState, fetchWikiPages, moveWikiPage } from '../../api/projects';
import type { Entity, ProjectMeta } from '../../types';
import { setLastWikiPageForProjectView } from '../../workspace/storage';
import {
  buildMoveParentOptions,
  collectWikiSubtreeIds,
  listMoveSiblingMetas,
} from './wikiMoveHelpers';

const ROOT_VALUE = '__root__';

export type WikiMoveDialogProps = {
  open: boolean;
  onClose: () => void;
  sourceProjectId: string;
  pageId: string;
  pages: Entity[];
  projects: ProjectMeta[];
  onRefreshProject: () => void | Promise<unknown>;
};

export function WikiMoveDialog({
  open,
  onClose,
  sourceProjectId,
  pageId,
  pages,
  projects,
  onRefreshProject,
}: WikiMoveDialogProps) {
  const navigate = useNavigate();
  const [destProjectId, setDestProjectId] = useState(sourceProjectId);
  const [destMetas, setDestMetas] = useState<Awaited<ReturnType<typeof fetchWikiPages>>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [parentSelect, setParentSelect] = useState(ROOT_VALUE);
  const [beforePageId, setBeforePageId] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subtreeIds = useMemo(() => collectWikiSubtreeIds(pageId, pages), [pageId, pages]);

  const excludeForDest = useMemo(() => {
    if (destProjectId === sourceProjectId) return subtreeIds;
    return new Set<string>();
  }, [destProjectId, sourceProjectId, subtreeIds]);

  useEffect(() => {
    if (!open) return;
    setDestProjectId(sourceProjectId);
    setParentSelect(ROOT_VALUE);
    setBeforePageId('');
    setLoadError(null);
    setSaveError(null);
  }, [open, sourceProjectId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setLoadError(null);
      try {
        const list = await fetchWikiPages(destProjectId);
        if (!cancelled) setDestMetas(list);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load wiki pages');
          setDestMetas([]);
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, destProjectId]);

  const parentOptions = useMemo(
    () => buildMoveParentOptions(destMetas, excludeForDest),
    [destMetas, excludeForDest]
  );

  const destParentId = parentSelect === ROOT_VALUE ? null : parentSelect;

  const siblingMetas = useMemo(
    () => listMoveSiblingMetas(destMetas, destParentId, excludeForDest),
    [destMetas, destParentId, excludeForDest]
  );

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const destinationParentId = destParentId;
      const before =
        beforePageId === '' || beforePageId === '__end__' ? null : beforePageId;
      await moveWikiPage(sourceProjectId, pageId, {
        destinationProjectId: destProjectId,
        destinationParentId,
        beforePageId: before,
      });
      await onRefreshProject();
      if (destProjectId !== sourceProjectId) {
        const { project } = await fetchProjectState(destProjectId);
        const wikiView = project.config.manifest.views.find((v) => v.type === 'wiki');
        if (wikiView) {
          setLastWikiPageForProjectView(destProjectId, wikiView.id, pageId);
          const p = encodeURIComponent(destProjectId);
          const v = encodeURIComponent(wikiView.id);
          const e = encodeURIComponent(pageId);
          navigate(`/p/${p}/v/${v}/e/${e}`, { replace: false });
        } else {
          navigate(`/p/${encodeURIComponent(destProjectId)}`, { replace: false });
        }
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setSaving(false);
    }
  }, [
    destParentId,
    beforePageId,
    sourceProjectId,
    pageId,
    destProjectId,
    onRefreshProject,
    navigate,
    onClose,
  ]);

  const pageTitle =
    pages.find((p) => p.id === pageId)?.properties?.title != null
      ? String(pages.find((p) => p.id === pageId)?.properties?.title ?? 'Untitled')
      : 'Untitled';

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Move page</DialogTitle>
      <DialogContent className="space-y-4 pt-2">
        <p className="text-sm text-zinc-400">
          Move &quot;{pageTitle}&quot; and its subpages. Subtree moves with the page when crossing projects.
        </p>
        {loadError && <p className="text-sm text-red-400">{loadError}</p>}
        {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        <FormControl fullWidth size="small" disabled={listLoading || saving}>
          <InputLabel id="wiki-move-project-label">Destination project</InputLabel>
          <Select
            labelId="wiki-move-project-label"
            label="Destination project"
            value={destProjectId}
            onChange={(e) => setDestProjectId(String(e.target.value))}
          >
            {projects.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
                {p.projectKey ? ` (${p.projectKey})` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" disabled={listLoading || saving}>
          <InputLabel id="wiki-move-parent-label">Destination parent</InputLabel>
          <Select
            labelId="wiki-move-parent-label"
            label="Destination parent"
            value={parentSelect}
            onChange={(e) => {
              setParentSelect(String(e.target.value));
              setBeforePageId('');
            }}
          >
            {parentOptions.map((o) => (
              <MenuItem key={o.id ?? ROOT_VALUE} value={o.id ?? ROOT_VALUE}>
                <span style={{ paddingLeft: o.depth * 12 }}>{o.title}</span>
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>Choose a folder or page to nest under, or root level.</FormHelperText>
        </FormControl>
        <FormControl fullWidth size="small" disabled={listLoading || saving}>
          <InputLabel id="wiki-move-before-label">Position among siblings</InputLabel>
          <Select
            labelId="wiki-move-before-label"
            label="Position among siblings"
            value={beforePageId === '' ? '__end__' : beforePageId}
            onChange={(e) => {
              const v = String(e.target.value);
              setBeforePageId(v === '__end__' ? '' : v);
            }}
          >
            {siblingMetas.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                Before &quot;{m.title || 'Untitled'}&quot;
              </MenuItem>
            ))}
            <MenuItem value="__end__">At end</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || listLoading}>
          Move
        </Button>
      </DialogActions>
    </Dialog>
  );
}
