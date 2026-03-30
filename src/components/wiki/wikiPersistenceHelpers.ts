import type { Entity } from '../../types';
import { getOrder, ORDER_GAP, ORDER_KEY } from '../board/boardOrder';
import { getParentId } from './wikiTreeHelpers';

export type CreateWikiNodeOptions = {
  parentId?: string | null;
  nodeType?: 'page' | 'folder';
};

export function createWikiNodeWithOrder(args: {
  pages: Entity[];
  onCreatePage: (opts: CreateWikiNodeOptions) => Entity;
  onUpdatePage: (id: string, patch: Record<string, any>) => void;
  onSelectPage: (id: string) => void;
  setDocById: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  setLastSavedDocById: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  setTitleById: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLastSavedTitleById: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  autoEditPageIdRef: React.MutableRefObject<string | null>;
  lastCreatedPageIdRef: React.MutableRefObject<string | null>;
  parentId?: string | null;
  nodeType?: 'page' | 'folder';
  initialTitle?: string;
}) {
  const {
    pages,
    onCreatePage,
    onUpdatePage,
    onSelectPage,
    setDocById,
    setLastSavedDocById,
    setTitleById,
    setLastSavedTitleById,
    autoEditPageIdRef,
    lastCreatedPageIdRef,
    parentId = null,
    nodeType = 'page',
    initialTitle: initialTitleArg,
  } = args;

  const siblings = pages.filter((p) => getParentId(p) === parentId);
  const existingOrders = siblings.map((p) => getOrder(p)).filter((o): o is number => o !== null);
  const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -ORDER_GAP;
  const newOrder = maxOrder + ORDER_GAP;

  const created = onCreatePage({ parentId, nodeType });
  const patch: Record<string, unknown> = { [ORDER_KEY]: newOrder };
  if (parentId != null) patch.parentId = parentId;
  if (nodeType) patch.nodeType = nodeType;
  if (initialTitleArg != null && initialTitleArg.trim() !== '') {
    patch.title = initialTitleArg.trim();
  }
  onUpdatePage(created.id, patch);

  const rawDoc = String(created.properties?.doc ?? '');
  const docToUse = rawDoc.trim().length > 0 ? rawDoc : '[]';
  const initialTitle =
    initialTitleArg != null && initialTitleArg.trim() !== ''
      ? initialTitleArg.trim()
      : String(created.properties?.title ?? '');
  setDocById((prev) => ({ ...prev, [created.id]: docToUse }));
  setLastSavedDocById((prev) => ({ ...prev, [created.id]: docToUse }));
  setTitleById((prev) => ({ ...prev, [created.id]: initialTitle }));
  setLastSavedTitleById((prev) => ({ ...prev, [created.id]: initialTitle }));
  onSelectPage(created.id);
  autoEditPageIdRef.current = created.id;
  lastCreatedPageIdRef.current = created.id;
}

export async function deleteWikiPageWithSave(args: {
  id: string;
  pages: Entity[];
  docById: Record<string, string | undefined>;
  lastSavedDocById: Record<string, string | undefined>;
  titleById: Record<string, string>;
  lastSavedTitleById: Record<string, string | undefined>;
  setDocById: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  setLastSavedDocById: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  setTitleById: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLastSavedTitleById: React.Dispatch<React.SetStateAction<Record<string, string | undefined>>>;
  onUpdatePageRef: React.MutableRefObject<(id: string, patch: Record<string, any>) => void>;
  onDeletePage: (id: string) => void;
  dialog: { confirm: (opts: { title: string; message: string; confirmText: string; danger?: boolean }) => Promise<boolean> };
}) {
  const {
    id,
    pages,
    docById,
    lastSavedDocById,
    titleById,
    lastSavedTitleById,
    setDocById,
    setLastSavedDocById,
    setTitleById,
    setLastSavedTitleById,
    onUpdatePageRef,
    onDeletePage,
    dialog,
  } = args;

  const currentDoc = docById[id];
  const lastSavedDoc = lastSavedDocById[id];
  const currentTitle = titleById[id];
  const lastSavedTitle = lastSavedTitleById[id];
  const hasDocChanges = currentDoc !== undefined && currentDoc !== lastSavedDoc;
  const hasTitleChanges = currentTitle !== undefined && currentTitle !== lastSavedTitle;

  if (hasDocChanges || hasTitleChanges) {
    try {
      await new Promise<void>((resolve) => {
        const update: Record<string, any> = {};
        if (hasDocChanges) {
          update.doc = currentDoc;
          setLastSavedDocById((prev) => ({ ...prev, [id]: currentDoc }));
        }
        if (hasTitleChanges) {
          update.title = currentTitle;
          setLastSavedTitleById((prev) => ({ ...prev, [id]: currentTitle }));
        }
        onUpdatePageRef.current(id, update);
        setTimeout(resolve, 100);
      });
    } catch (e) {
      console.error(`[wiki] Failed to save page ${id} before delete:`, e);
    }
  }

  const title = String(pages.find((p) => p.id === id)?.properties?.title ?? 'Untitled');
  const confirmed = await dialog.confirm({
    title: 'Delete Page',
    message: `Are you sure you want to delete page '${title}'?`,
    confirmText: 'Delete',
    danger: true,
  });
  if (!confirmed) return;

  setDocById((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
  setLastSavedDocById((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
  setTitleById((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
  setLastSavedTitleById((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
  onDeletePage(id);
}
