import { useEffect, useMemo, useRef } from 'react';
import { BlockNoteEditor } from '@blocknote/core';
import { blocksToYXmlFragment } from '@blocknote/core/yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { ApiError } from '../../auth/api';
import { saveWikiCollabState } from '../../api/projects';
import { getBackendUrl } from '../../utils/storage';
import { createTaskLinkSchema, parseDoc, resolveRelativeApiUrlsInBlockNoteBlocks } from '../richText/richTextEditorHelpers';

const WS_PATH = '/api/wiki/collab/ws';
const DOC_PREFIX = 'wiki:';
const DOC_FRAGMENT_KEY = 'document-store';
const SAVE_DEBOUNCE_MS = 1200;

const toWsUrl = (httpBase: string): string => {
  const u = new URL(httpBase);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = WS_PATH;
  u.search = '';
  return u.toString();
};

const getCollabUrlFromEnv = (): string | undefined => {
  const value =
    ((globalThis as any).process?.env?.VITE_KEEL_COLLAB_URL as unknown) ??
    ((import.meta as any).env?.VITE_KEEL_COLLAB_URL as unknown);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const pickUserColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const palette = ['#7c3aed', '#2563eb', '#0d9488', '#f59e0b', '#dc2626', '#7c2d12'];
  return palette[Math.abs(hash) % palette.length];
};

const hasMeaningfulInlineContent = (inline: any): boolean => {
  if (!inline || typeof inline !== 'object') return false;
  if (inline.type === 'text') {
    return typeof inline.text === 'string' && inline.text.trim().length > 0;
  }
  // Non-text inline nodes (task links, status, etc.) are meaningful.
  return true;
};

const hasMeaningfulBlock = (block: any): boolean => {
  if (!block || typeof block !== 'object') return false;
  const content = Array.isArray(block.content) ? block.content : [];
  if (content.some(hasMeaningfulInlineContent)) return true;
  const children = Array.isArray(block.children) ? block.children : [];
  return children.some(hasMeaningfulBlock);
};

const isMeaningfulDocJson = (docJson: string | undefined): boolean => {
  if (typeof docJson !== 'string') return false;
  const trimmed = docJson.trim();
  if (trimmed.length === 0) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return trimmed !== '[]';
    return parsed.some(hasMeaningfulBlock);
  } catch {
    // Keep non-JSON strings as meaningful to avoid destructive fallback.
    return true;
  }
};

type UseWikiCollaborationArgs = {
  enabled: boolean;
  projectId: string;
  pageId: string;
  docJson: string | undefined;
  crdtBlob?: number[];
  userName?: string;
  onPersisted?: (payload: WikiCollabPersistPayload) => void;
  /** Called when save returns 404 (page was deleted by another user). */
  onPageDeleted?: () => void;
  /** Returns current doc from editor at persist time. Used when Yjs doesn't sync to React state in time. */
  getCurrentDoc?: () => string;
};

export type WikiCollabPersistPayload = {
  doc: string;
  crdtBlob: number[];
};

export const useWikiCollaboration = ({
  enabled,
  projectId,
  pageId,
  docJson,
  crdtBlob,
  userName,
  onPersisted,
  onPageDeleted,
  getCurrentDoc,
}: UseWikiCollaborationArgs) => {
  const backendBase = getBackendUrl();
  const wsUrl = getCollabUrlFromEnv() ?? (backendBase ? toWsUrl(backendBase) : null);
  const active = enabled && !!wsUrl;
  const hasInitialBlob = Array.isArray(crdtBlob) && crdtBlob.length > 0;
  const docRef = useRef<string>(docJson ?? '');
  const onPersistedRef = useRef<typeof onPersisted>(onPersisted);
  const onPageDeletedRef = useRef<typeof onPageDeleted>(onPageDeleted);
  const timerRef = useRef<number | null>(null);
  const migrateTimerRef = useRef<number | null>(null);
  const activeProviderRef = useRef<HocuspocusProvider | null>(null);
  const activeYdocRef = useRef<Y.Doc | null>(null);
  const persistInFlightRef = useRef<Promise<void> | null>(null);
  const hasPendingPersistRef = useRef(false);
  const initialBlobAppliedRef = useRef<{ ydoc: Y.Doc | null; applied: boolean }>({ ydoc: null, applied: false });

  useEffect(() => {
    docRef.current = docJson ?? '';
  }, [docJson]);

  useEffect(() => {
    onPersistedRef.current = onPersisted;
  }, [onPersisted]);
  useEffect(() => {
    onPageDeletedRef.current = onPageDeleted;
  }, [onPageDeleted]);
  const getCurrentDocRef = useRef(getCurrentDoc);
  useEffect(() => {
    getCurrentDocRef.current = getCurrentDoc;
  }, [getCurrentDoc]);

  const ydoc = useMemo(() => {
    const doc = new Y.Doc();
    let applied = false;
    // Apply blob during Y.Doc creation so the first editor mount does not paint an empty fragment.
    if (crdtBlob && crdtBlob.length > 0) {
      try {
        Y.applyUpdate(doc, Uint8Array.from(crdtBlob));
        applied = true;
      } catch (error) {
        console.warn('[wiki] failed to apply initial CRDT blob', error);
      }
    }
    initialBlobAppliedRef.current = { ydoc: doc, applied };
    return doc;
  }, [projectId, pageId]);
  const lastSeededKeyRef = useRef<string | null>(null);
  const fragment = useMemo(() => {
    const f = ydoc.getXmlFragment(DOC_FRAGMENT_KEY);
    const pageKey = `${projectId}:${pageId}`;
    const alreadySeededForThisPage = lastSeededKeyRef.current === pageKey;
    // REQ-232: Seed only once per page. Re-seeding when docJson changes (from onChange)
    // overwrites the Yjs document and causes typed characters to disappear.
    if (!hasInitialBlob && !alreadySeededForThisPage && isMeaningfulDocJson(docJson)) {
      const blocks = resolveRelativeApiUrlsInBlockNoteBlocks(parseDoc(docJson));
      if (blocks && blocks.length > 0) {
        try {
          const schema = createTaskLinkSchema({
            entitiesRef: { current: [] },
            onEntityClickRef: { current: undefined },
            isMountedRef: { current: true },
          });
          const editor = BlockNoteEditor.create({ schema }) as BlockNoteEditor<any, any, any>;
          blocksToYXmlFragment(editor, blocks as any, f);
          lastSeededKeyRef.current = pageKey;
        } catch (err) {
          console.warn('[wiki] failed to seed Yjs fragment from legacy doc', err);
        }
      }
    }
    return f;
  }, [ydoc, hasInitialBlob, docJson]);
  const provider = useMemo(() => {
    if (!active || !wsUrl) return null;
    const p = new HocuspocusProvider({
      url: wsUrl,
      name: `${DOC_PREFIX}${projectId}:${pageId}`,
      document: ydoc,
      onStatus: ({ status }) => {
        if (status === 'disconnected' || status === 'connecting') {
          console.info('[wiki-collab] status:', status, 'url:', wsUrl);
        }
      },
      onDisconnect: () => {
        console.warn('[wiki-collab] disconnected from', wsUrl);
      },
      onClose: ({ event }) => {
        if (event?.code !== 1000) {
          console.warn('[wiki-collab] websocket closed', event?.code, event?.reason, 'url:', wsUrl);
        }
      },
    });
    return p;
  }, [active, wsUrl, pageId, projectId, ydoc]);

  useEffect(() => {
    if (!crdtBlob || crdtBlob.length === 0) return;
    if (initialBlobAppliedRef.current.ydoc === ydoc && initialBlobAppliedRef.current.applied) {
      return;
    }
    try {
      Y.applyUpdate(ydoc, Uint8Array.from(crdtBlob));
      initialBlobAppliedRef.current = { ydoc, applied: true };
    } catch (error) {
      console.warn('[wiki] failed to apply initial CRDT blob', error);
    }
  }, [crdtBlob, pageId, ydoc]);

  useEffect(() => {
    if (!active || !provider) return;
    activeProviderRef.current = provider;
    activeYdocRef.current = ydoc;

    const persistSnapshot = async () => {
      if (persistInFlightRef.current) {
        await persistInFlightRef.current;
        return;
      }
      const persistPromise = (async () => {
        hasPendingPersistRef.current = false;
        try {
          const blob = Array.from(Y.encodeStateAsUpdate(ydoc));
          const fromEditor = getCurrentDocRef.current?.();
          const hasEditorDoc = isMeaningfulDocJson(fromEditor);
          const hasFallbackDoc = isMeaningfulDocJson(docRef.current);
          // Legacy page migration guard:
          // when editor is still empty but existing wiki doc is non-empty, skip
          // persisting to avoid writing an empty CRDT snapshot.
          if (!hasInitialBlob && !hasEditorDoc && hasFallbackDoc) {
            return;
          }
          const nextDoc = hasEditorDoc ? (fromEditor ?? '') : docRef.current ?? '';
          await saveWikiCollabState(projectId, pageId, { doc: nextDoc, crdtBlob: blob });
          onPersistedRef.current?.({ doc: nextDoc, crdtBlob: blob });
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            onPageDeletedRef.current?.();
            return;
          }
          console.warn('[wiki] failed to persist collab snapshot', error);
        } finally {
          persistInFlightRef.current = null;
        }
      })();
      persistInFlightRef.current = persistPromise;
      try {
        await persistPromise;
      } finally {
        persistInFlightRef.current = null;
      }
    };

    const schedulePersist = () => {
      hasPendingPersistRef.current = true;
      if (timerRef.current) {
        globalThis.clearTimeout(timerRef.current);
      }
      timerRef.current = globalThis.setTimeout(async () => {
        timerRef.current = null;
        await persistSnapshot();
      }, SAVE_DEBOUNCE_MS) as unknown as number;
    };

    // One-shot migration on first page open when legacy page has no CRDT blob.
    // This runs even if user only opens the page without typing.
    if (!hasInitialBlob) {
      hasPendingPersistRef.current = true;
      migrateTimerRef.current = globalThis.setTimeout(() => {
        migrateTimerRef.current = null;
        void persistSnapshot();
      }, 900) as unknown as number;
    }

    ydoc.on('update', schedulePersist);
    return () => {
      ydoc.off('update', schedulePersist);
      const shouldFlushOnCleanup = hasPendingPersistRef.current;
      if (timerRef.current) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (migrateTimerRef.current) {
        globalThis.clearTimeout(migrateTimerRef.current);
        migrateTimerRef.current = null;
      }
      hasPendingPersistRef.current = false;
      if (activeProviderRef.current === provider) {
        activeProviderRef.current = null;
      }
      if (activeYdocRef.current === ydoc) {
        activeYdocRef.current = null;
      }
      queueMicrotask(() => {
        if (activeProviderRef.current !== provider && shouldFlushOnCleanup && !persistInFlightRef.current) {
          void persistSnapshot();
        }
        // React StrictMode runs cleanup/setup twice in dev. Delay destroy and
        // skip it if the same provider/doc became active again immediately.
        if (activeProviderRef.current !== provider) {
          provider.destroy();
        }
        if (activeYdocRef.current !== ydoc) {
          ydoc.destroy();
        }
      });
    };
  }, [active, hasInitialBlob, pageId, projectId, provider, ydoc]);

  return {
    enabled: active && !!provider,
    provider,
    fragment,
    user: {
      name: userName?.trim() || 'Anonymous',
      color: pickUserColor(userName?.trim() || 'anonymous'),
    },
  };
};
