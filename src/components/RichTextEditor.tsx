import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BlockNoteView } from '@blocknote/ariakit';
import { useCreateBlockNote, useEditorChange } from '@blocknote/react';
import { getDefaultReactSlashMenuItems, SuggestionMenuController } from '@blocknote/react';
import type { PartialBlock } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import type { AttachmentMeta, Entity } from '../types';
import { convertBlockContent } from './richTextTaskLinking';
import { replaceTrailingSymbols } from './richTextSymbolSubstitutions';
import { findBlockById } from './richText/richTextEditorPasteHelpers';
import { uploadAttachmentsApi } from '../api/attachments';
import { apiBaseUrl } from '../auth/api';
import { buildAttachmentUrl, parseAttachments } from './entityDetail/attachments/attachmentsUtils';
import type { RichTextEditorProps } from './richText/richTextEditorTypes';
import {
  createTaskLinkSchema,
  parseDoc,
  resolveRelativeApiUrlsInBlockNoteBlocks,
} from './richText/richTextEditorHelpers';
import { StableFormattingToolbarController } from './richText/StableFormattingToolbarController';
import { StatusDialog } from './richText/StatusDialog';
import { StatusEditContext } from './richText/StatusEditContext';
import { useRichTextCollabUndo } from './richText/useRichTextCollabUndo';
import { useRichTextStatusEdit } from './richText/useRichTextStatusEdit';
import { useRichTextPasteAndUpload } from './richText/useRichTextPasteAndUpload';
import { useRichTextEscapeKey } from './richText/useRichTextEscapeKey';
import { useRichTextFocus } from './richText/useRichTextFocus';

export function RichTextEditor({
  value,
  editable,
  focusRequest,
  focusRequestToken,
  onChange,
  className,
  entities = [],
  onEntityClick,
  attachmentContext,
  collaboration,
  getDocRef,
}: RichTextEditorProps) {
  // When collaboration is active, content comes from the Yjs fragment; passing initialContent causes conflicts.
  // BlockNote rejects empty arrays; use a default paragraph block when doc is [].
  const initialContent = useMemo(() => {
    if (collaboration) return undefined;
    const parsed = parseDoc(value);
    const withUrls = resolveRelativeApiUrlsInBlockNoteBlocks(parsed);
    if (withUrls && Array.isArray(withUrls) && withUrls.length === 0) {
      return [{ type: 'paragraph', content: [] }] as PartialBlock[];
    }
    return withUrls;
  }, [value, collaboration]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Use refs to keep latest entities and onEntityClick for task link spec
  const entitiesRef = useRef<Entity[]>(entities);
  const onEntityClickRef = useRef<((entity: Entity) => void) | undefined>(onEntityClick);
  const isMountedRef = useRef(true);
  const suppressedKeysRef = useRef<Map<string, Set<string>>>(new Map());
  const attachmentsRef = useRef<AttachmentMeta[]>([]);
  const attachmentProjectId = attachmentContext?.projectId;
  const attachmentEntityPk = attachmentContext?.entityPk;
  const onServerEntity = attachmentContext?.onServerEntity;
  
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);
  
  useEffect(() => {
    onEntityClickRef.current = onEntityClick;
  }, [onEntityClick]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!attachmentContext?.values) return;
    attachmentsRef.current = parseAttachments(attachmentContext.values);
  }, [attachmentContext?.values]);
  
  // Create schema with task link inline content
  const schema = useMemo(() => {
    return createTaskLinkSchema({
      entitiesRef,
      onEntityClickRef,
      isMountedRef,
    });
  }, []); // Empty deps - schema is created once, refs are updated via useEffect

  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      if (!attachmentProjectId || !attachmentEntityPk) {
        throw new Error('Attachments are not available for this editor.');
      }
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files can be inserted.');
      }

      const before = attachmentsRef.current;
      const beforeIds = new Set(before.map((a) => a.id));
      const { entity: updated, etag } = await uploadAttachmentsApi(
        attachmentProjectId,
        attachmentEntityPk,
        [file]
      );
      onServerEntity?.(updated, etag);
      const after = parseAttachments(updated.properties ?? {});
      attachmentsRef.current = after;

      const added = after.filter((a) => !beforeIds.has(a.id));
      const matched =
        added.find((a) => a.fileName === file.name && a.size === file.size) ??
        added.find((a) => a.fileName === file.name) ??
        added[0];

      if (!matched) {
        throw new Error('Failed to resolve uploaded image.');
      }

      return buildAttachmentUrl(apiBaseUrl(), attachmentProjectId, attachmentEntityPk, matched.id);
    },
    [attachmentProjectId, attachmentEntityPk, onServerEntity]
  );

  const { pasteHandler } = useRichTextPasteAndUpload(
    uploadFile,
    attachmentProjectId,
    attachmentEntityPk
  );

  const createBlockNoteOptions = useMemo(
    () =>
      ({
        initialContent,
        schema,
        ...(collaboration
          ? {
              collaboration: {
                provider: collaboration.provider as any,
                fragment: collaboration.fragment as any,
                user: collaboration.user,
              },
            }
          : {}),
        uploadFile: attachmentProjectId && attachmentEntityPk ? uploadFile : undefined,
        pasteHandler,
      }) as any,
    [
      initialContent,
      schema,
      collaboration?.provider,
      collaboration?.fragment,
      collaboration?.user,
      attachmentProjectId,
      attachmentEntityPk,
      uploadFile,
      pasteHandler,
    ]
  );

  const editor: any = useCreateBlockNote(createBlockNoteOptions);

  useEffect(() => {
    if (getDocRef && editor) {
      getDocRef.current = () => JSON.stringify(editor.document);
    }
    return () => {
      if (getDocRef) getDocRef.current = null;
    };
  }, [editor, getDocRef]);

  const debounceTimer = useRef<number | null>(null);
  const processingRef = useRef(false);
  const {
    collabSnapshotRef,
    collabUndoSnapshotsRef,
    collabRedoSnapshotsRef,
    applyingCollabHistoryRef,
    maxEntries: MAX_COLLAB_HISTORY_ENTRIES,
  } = useRichTextCollabUndo(editor, containerRef, editable, collaboration);
  const {
    statusDialogOpen,
    statusEditInitialValues,
    statusEditContextValue,
    handleStatusConfirm,
    closeStatusDialog,
    setStatusDialogOpen,
  } = useRichTextStatusEdit(editor, editable);

  const getSlashMenuItems = useCallback(
    async (query: string) => {
      const defaultItems = getDefaultReactSlashMenuItems(editor);
      const statusItem = {
        title: 'Status',
        onItemClick: () => setStatusDialogOpen(true),
        aliases: ['status', 'pill'],
        group: 'Other',
      };
      return filterSuggestionItems([...defaultItems, statusItem], query);
    },
    [editor, setStatusDialogOpen]
  );

  useRichTextEscapeKey(editor, containerRef, editable, processingRef, suppressedKeysRef);
  useRichTextFocus(editor, containerRef, editable, focusRequestToken, focusRequest);

  // Auto-detect task keys in text and convert to inline content
  // REQ-232: Rely on yjs-remote skip and mayLose check to avoid overwriting local typing.
  useEditorChange((changedEditor, { getChanges }) => {
    if (!editable || processingRef.current) return;

    try {
      const changes = getChanges();
      if (!changes.length) return;

      const blocksToUpdate: Array<{ block: any; content: any; sourceType?: string }> = [];
      const seen = new Set<string>();

      for (const change of changes) {
        const block = change.block;
        if (!block || seen.has(block.id)) continue;
        seen.add(block.id);

        const sourceType = (change as { source?: { type?: string } }).source?.type ?? 'unknown';
        // REQ-232: Skip yjs-remote changes. Processing remote changes and calling updateBlock
        // can overwrite local typing with stale remote content, causing characters to disappear.
        if (sourceType === 'yjs-remote') continue;

        let contentToConvert: unknown = block.content;
        if (Array.isArray(block.content)) {
          const symbolResult = replaceTrailingSymbols(block.content as Parameters<typeof replaceTrailingSymbols>[0]);
          if (symbolResult.changed) {
            contentToConvert = symbolResult.content;
          }
        }

        const suppressedKeys = suppressedKeysRef.current.get(block.id) ?? new Set<string>();
        const converted = convertBlockContent(
          { id: block.id, content: contentToConvert } as { id: string; content?: unknown },
          suppressedKeys
        );

        const finalContent = converted.changed ? converted.content : contentToConvert;
        if (converted.changed || contentToConvert !== block.content) {
          blocksToUpdate.push({ block, content: finalContent, sourceType });
        }
      }

      if (blocksToUpdate.length > 0) {
        processingRef.current = true;

        for (const { block, content } of blocksToUpdate) {
          const currentBlock = findBlockById(changedEditor.document as Array<{ id?: string; content?: unknown; children?: unknown[] }>, block.id);
          const currentContentJson = currentBlock ? JSON.stringify(currentBlock.content) : '';
          const blockContentJson = JSON.stringify(block.content);
          // REQ-232: Skip when current doc has changed since we got our change (e.g. user typed more).
          // REQ-240: Use content equality instead of length - symbol conversion shortens content (-> to →)
          // so length-based check would incorrectly block it.
          if (currentContentJson !== blockContentJson) continue;
          changedEditor.updateBlock(block.id, {
            content: content as any,
          });
          try {
            changedEditor.setTextCursorPosition(block.id, 'end');
          } catch {
            // Table blocks may not support placement; ignore
            void 0;
          }
        }
        queueMicrotask(() => {
          processingRef.current = false;
        });
      }
    } catch (e) {
      console.warn('[keel] Failed to process task keys:', e);
      processingRef.current = false;
    }
  }, editor);

  useEditorChange((changedEditor, { getChanges }) => {
    if (debounceTimer.current) globalThis.clearTimeout(debounceTimer.current);

    const changes = getChanges?.() ?? [];
    const hasPaste = changes.some(
      (c: { source?: { type?: string } }) => c?.source?.type === 'paste'
    );
    const nextDoc = JSON.stringify(changedEditor.document);
    if (collaboration && changes.length > 0) {
      const hasLocalChange = changes.some(
        (c: { source?: { type?: string } }) => c?.source?.type !== 'yjs-remote'
      );
      if (collabSnapshotRef.current == null) {
        collabSnapshotRef.current = nextDoc;
      } else if (applyingCollabHistoryRef.current) {
        collabSnapshotRef.current = nextDoc;
      } else if (hasLocalChange) {
        if (collabSnapshotRef.current !== nextDoc) {
          collabUndoSnapshotsRef.current.push(collabSnapshotRef.current);
          if (collabUndoSnapshotsRef.current.length > MAX_COLLAB_HISTORY_ENTRIES) {
            collabUndoSnapshotsRef.current.shift();
          }
          collabRedoSnapshotsRef.current = [];
          collabSnapshotRef.current = nextDoc;
        }
      } else {
        collabSnapshotRef.current = nextDoc;
      }
    }
    // REQ-232: When collaboration is on, skip onChange. Parent gets doc only from onCollabPersisted.
    // Calling onChange triggers parent re-renders that can cause fragment re-seed or other races.
    if (!collaboration) {
      if (hasPaste) {
        try {
          onChange(nextDoc);
        } catch (e) {
          console.warn('[keel] Failed to serialize richtext doc:', e);
        }
      } else {
        debounceTimer.current = globalThis.setTimeout(() => {
          try {
            onChange(nextDoc);
          } catch (e) {
            console.warn('[keel] Failed to serialize richtext doc:', e);
          }
        }, 400) as unknown as number;
      }
    }
  }, editor);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) globalThis.clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!editable) return;
    const preventLinkNav = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest?.('a[href]');
      if (link && containerRef.current?.contains(link)) {
        e.preventDefault();
      }
    };
    document.addEventListener('click', preventLinkNav, { capture: true, passive: false });
    document.addEventListener('mousedown', preventLinkNav, { capture: true, passive: false });
    document.addEventListener('auxclick', preventLinkNav, { capture: true, passive: false });
    return () => {
      document.removeEventListener('click', preventLinkNav, { capture: true });
      document.removeEventListener('mousedown', preventLinkNav, { capture: true });
      document.removeEventListener('auxclick', preventLinkNav, { capture: true });
    };
  }, [editable]);

  return (
    <div className={className} ref={containerRef}>
      <div className="text-[14px] [&_.bn-editor]:text-[14px]">
        <StatusEditContext.Provider value={statusEditContextValue}>
          <BlockNoteView
            editor={editor}
            editable={editable}
            theme="dark"
            sideMenu={editable ? undefined : false}
            formattingToolbar={false}
            linkToolbar={editable && !collaboration ? undefined : false}
            filePanel={editable ? undefined : false}
            slashMenu={false}
            tableHandles={editable ? undefined : false}
          >
            {editable ? (
              <>
                <StableFormattingToolbarController />
                <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
              </>
            ) : null}
            <StatusDialog
              open={statusDialogOpen}
              onClose={closeStatusDialog}
              onConfirm={handleStatusConfirm}
              initialValues={statusEditInitialValues ?? undefined}
            />
          </BlockNoteView>
        </StatusEditContext.Provider>
      </div>
    </div>
  );
}

